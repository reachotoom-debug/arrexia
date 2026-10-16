import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { EntitlementError, TRIAL_EXPIRED_MESSAGE } from "@/lib/billing/entitlementErrors";

const requireForTest = createRequire(__filename);

function load(path: string, dependencies: Record<string, unknown>): any {
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  new Function("require", "exports", code)((name: string) => name in dependencies ? dependencies[name] : requireForTest(name), exports);
  return exports;
}

function fixture(state: "expired" | "active" | "paid") {
  const writes: Array<{ table: string; payload: any }> = [];
  const restores: Array<{ name: string; args: unknown }> = [];
  const refreshes: string[] = [];
  const events: string[] = [];
  const dependencies = {
    "@/lib/auth/server": { requireWorkspace: async () => { events.push("auth"); return { workspace: { id: "workspace" } }; } },
    "@/lib/billing/entitlementGuard": { assertWorkspaceMutationAllowed: async () => {
      events.push("guard");
      if (state === "expired") throw new EntitlementError("TRIAL_EXPIRED", TRIAL_EXPIRED_MESSAGE);
    } },
    "@/lib/supabase/server": { supabaseServer: async () => ({ from(table: string) {
      events.push("database");
      let updating = false;
      const query: any = {
        update(payload: any) { updating = true; writes.push({ table, payload }); return query; },
        select() { return query; }, eq() { return query; }, in() { return query; }, or() { return query; },
        not(column: string, operator: string, value: unknown) {
          assert.deepEqual([table, column, operator, value], ["payments", "archived_at", "is", null]);
          return query;
        },
        order(column: string, options: { ascending: boolean }) {
          assert.equal(column, "id");
          assert.equal(options.ascending, true);
          return query;
        },
        range(from: number, to: number) {
          assert.deepEqual([from, to], [0, 499]);
          return Promise.resolve({ data: [{ id: `${table}-1` }], error: null });
        },
        single: async () => ({ data: { id: "client" }, error: null }),
        then(resolve: any) { return Promise.resolve({ data: updating ? [] : [{ id: `${table}-1` }], error: null }).then(resolve); },
      };
      return query;
    }, async rpc(name: string, args: unknown) {
      events.push("rpc");
      restores.push({ name, args });
      return { data: { ok: true }, error: null };
    } }) },
    "next/cache": { revalidatePath: (path: string) => refreshes.push(path) },
  };
  return { writes, restores, refreshes, events,
    toggle: load("app/[workspaceId]/clients/actions.ts", dependencies).toggleClientActive,
    ...load("app/[workspaceId]/clients/_actions/clientActions.ts", dependencies) };
}

for (const active of [true, false]) {
  test(`expired trial blocks ${active ? "activation" : "inactivation"} with structured canonical error`, async () => {
    const f = fixture("expired");
    assert.deepEqual(await f.toggle("workspace", "client", active), { ok: false, message: TRIAL_EXPIRED_MESSAGE, code: "TRIAL_EXPIRED" });
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.refreshes, []);
    assert.deepEqual(f.events, ["auth", "guard"]);
  });
}

for (const method of ["archiveClient", "unarchiveClient"]) {
  for (const cascade of [false, true]) {
    test(`expired trial blocks ${method} cascade=${cascade} before client/invoice/payment writes`, async () => {
      const f = fixture("expired");
      assert.deepEqual(await f[method]("workspace", "client", cascade), { ok: false, error: TRIAL_EXPIRED_MESSAGE, code: "TRIAL_EXPIRED" });
      assert.deepEqual(f.writes, []);
      assert.deepEqual(f.restores, []);
      assert.deepEqual(f.refreshes, []);
      assert.deepEqual(f.events, ["auth", "guard"]);
    });
  }
  test(`expired trial blocks every underlying ${method} call used by bulk UI`, async () => {
    const f = fixture("expired");
    for (const id of ["client-1", "client-2", "client-3"]) {
      assert.deepEqual(await f[method]("workspace", id), { ok: false, error: TRIAL_EXPIRED_MESSAGE, code: "TRIAL_EXPIRED" });
    }
    assert.deepEqual(f.writes, []);
    assert.deepEqual(f.refreshes, []);
  });
}

for (const state of ["active", "paid"] as const) {
  for (const active of [true, false]) {
    test(`${state} workspace can set active=${active}`, async () => {
      const f = fixture(state);
      const result = await f.toggle("workspace", "client", active);
      assert.equal(result?.ok ?? true, true);
      assert.deepEqual(f.writes, [{ table: "clients", payload: { is_active: active } }]);
      assert.equal(f.refreshes.length, 3);
    });
  }
  for (const method of ["archiveClient", "unarchiveClient"]) {
    for (const cascade of [false, true]) {
      test(`${state} workspace preserves ${method} cascade=${cascade}`, async () => {
        const f = fixture(state);
        assert.deepEqual(await f[method]("workspace", "client", cascade), { ok: true });
        const guardedRestore = cascade && method === "unarchiveClient";
        assert.deepEqual(f.writes.map((w: any) => w.table), cascade
          ? guardedRestore ? ["clients", "invoices"] : ["clients", "invoices", "payments"]
          : ["clients"]);
        assert.deepEqual(f.restores, guardedRestore ? [{
          name: "rpc_unarchive_payment_manual",
          args: { p_workspace_id: "workspace", p_payment_id: "payments-1" },
        }] : []);
        assert.equal(f.writes[0].payload.archived_at === null, method === "unarchiveClient");
        if (method === "unarchiveClient") assert.equal(f.writes[0].payload.is_active, true);
        assert.equal(f.refreshes.length, 4);
        assert.deepEqual(f.events.slice(0, 2), ["auth", "guard"]);
      });
    }
  }
}

for (const currentActive of [true, false]) {
  test(`toggle UI shows canonical expired error with no refresh/success for currentActive=${currentActive}`, async () => {
    const f = fixture("expired");
    const toasts: any[] = [];
    let refreshes = 0;
    const jsx = (type: any, props: any) => ({ type, props });
    const { ToggleClientActive } = load("app/[workspaceId]/clients/[clientId]/_components/ToggleClientActive.tsx", {
      "react": { useState: (value: any) => [value, () => {}] },
      "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
      "next/navigation": { useRouter: () => ({ refresh: () => refreshes++ }) },
      "../../actions": { toggleClientActive: async () => ({ ok: false, message: TRIAL_EXPIRED_MESSAGE, code: "TRIAL_EXPIRED" }) },
      "../../_actions/getClientOutstanding": { getClientOutstanding: async () => ({ ok: true, outstanding: 0 }) },
      "../../_components/ArchiveConfirmDialog": { ArchiveConfirmDialog: () => null },
      "@/components/ui/use-toast": { useToast: () => ({ toast: (value: any) => toasts.push(value) }) },
    });
    const tree = ToggleClientActive({ workspaceId: "workspace", clientId: "client", currentActive });
    await tree.props.children[0].props.onClick();
    assert.equal(refreshes, 0);
    assert.deepEqual(f.writes, []);
    assert.equal(toasts.length, 1);
    assert.equal(toasts[0].variant, "destructive");
    assert.equal(toasts[0].description, TRIAL_EXPIRED_MESSAGE);
  });
}
