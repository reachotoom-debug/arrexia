import { createRequire } from "node:module";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";
import { EntitlementError, TRIAL_EXPIRED_MESSAGE } from "@/lib/billing/entitlementErrors";

const requireForTest = createRequire(__filename);

const workspaceId = "00000000-0000-4000-8000-000000000001";
const invoiceId = "00000000-0000-4000-8000-000000000002";

function load(path: string, dependencies: Record<string, unknown>, modal = false): any {
  const code = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;
  const exports = {};
  const fallback = new Proxy({ __esModule: true }, { get: (_target, key) => key === "__esModule" ? true : () => null });
  new Function("require", "exports", code + (path.endsWith("CollectionsTable.tsx") ? "\nexports.TestModal = CollectionsNotesModal;" : ""))(
    (name: string) => name in dependencies ? dependencies[name] : modal ? fallback : requireForTest(name), exports);
  return exports;
}

for (const state of ["expired", "active", "paid"]) {
  test(`collection note ${state} workspace returns controlled result and correct side effects`, async () => {
    const writes: any[] = [];
    const revalidations: string[] = [];
    const events: string[] = [];
    const { updateCollectionsNote } = load("app/[workspaceId]/collections/actions.ts", {
      "@/lib/auth/server": { requireWorkspace: async () => events.push("auth") },
      "@/lib/billing/entitlementGuard": { assertWorkspaceMutationAllowed: async (id: string, operation: string) => {
        assert.equal(id, workspaceId); assert.equal(operation, "invoice_update"); events.push("guard");
        if (state === "expired") throw new EntitlementError("TRIAL_EXPIRED", TRIAL_EXPIRED_MESSAGE);
      } },
      "@/lib/supabase/server": { supabaseServer: async () => ({ from(table: string) {
        events.push("database"); assert.equal(table, "invoices");
        const query: any = { update(payload: any) { writes.push(payload); return query; }, eq() { return query; },
          then(resolve: any) { return Promise.resolve({ error: null }).then(resolve); } };
        return query;
      } }) },
      "next/cache": { revalidatePath: (path: string) => revalidations.push(path) },
    });
    const result = await updateCollectionsNote({ workspaceId, invoiceId, notes: "Follow up next week" });
    assert.deepEqual(result, state === "expired" ? { ok: false, error: TRIAL_EXPIRED_MESSAGE, code: "TRIAL_EXPIRED" } : { ok: true });
    assert.deepEqual(events.slice(0, 2), ["auth", "guard"]);
    assert.deepEqual(writes, state === "expired" ? [] : [{ notes: "Follow up next week" }]);
    assert.equal(revalidations.length, state === "expired" ? 0 : 2);
  });
}

function ui() {
  const states: any[] = [];
  let index = 0;
  let transition: Promise<void> | undefined;
  const toasts: any[] = [];
  let refreshes = 0;
  const jsx = (type: any, props: any) => ({ type, props });
  return { states, toasts, get refreshes() { return refreshes; }, get transition() { return transition; }, reset() { index = 0; },
    dependencies: {
      "react": { useState: (initial: any) => {
        const key = index++; if (!(key in states)) states[key] = initial;
        return [states[key], (value: any) => { states[key] = value; }];
      }, useTransition: () => [false, (fn: () => Promise<void>) => { transition = fn(); }] },
      "react/jsx-runtime": { jsx, jsxs: jsx, Fragment: "fragment" },
      "next/navigation": { useRouter: () => ({ refresh: () => refreshes++ }) },
      "@/components/ui/use-toast": { useToast: () => ({ toast: (value: any) => toasts.push(value) }) },
      "../actions": { updateCollectionsNote: async () => ({ ok: false, error: TRIAL_EXPIRED_MESSAGE, code: "TRIAL_EXPIRED" }) },
    } };
}

test("CollectionNoteButton preserves open modal and shows canonical error without refresh/success", async () => {
  const f = ui();
  f.states[0] = true;
  const { CollectionNoteButton } = load("app/[workspaceId]/collections/_components/CollectionNoteButton.tsx", f.dependencies, true);
  const tree = CollectionNoteButton({ invoiceId, workspaceId, invoiceNumber: "INV-1", clientName: "Client", note: "Draft" });
  await tree.props.children[1].props.onSave("Draft");
  assert.equal(f.states[0], true);
  assert.equal(f.refreshes, 0);
  assert.deepEqual(f.toasts.map(({ variant, description }: any) => ({ variant, description })), [{ variant: "destructive", description: TRIAL_EXPIRED_MESSAGE }]);
});

test("CollectionsTable note modal stays open and renders canonical rejection", async () => {
  const f = ui(); let closes = 0;
  const { TestModal } = load("app/[workspaceId]/collections/_components/CollectionsTable.tsx", f.dependencies, true);
  const props = { invoice: { id: invoiceId, invoice_number: "INV-1", notes: "Draft" }, workspaceId, onClose: () => closes++ };
  const tree = TestModal(props);
  tree.props.children.props.children[1].props.onSubmit({ preventDefault() {} });
  await f.transition;
  assert.equal(closes, 0);
  f.reset();
  const updated = TestModal(props);
  assert.ok(JSON.stringify(updated).includes(TRIAL_EXPIRED_MESSAGE));
});
