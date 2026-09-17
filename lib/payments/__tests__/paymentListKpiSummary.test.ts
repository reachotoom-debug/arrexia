import { formatKpiMoneyTotals } from "@/lib/format/kpiMoney";
import * as jsxRuntime from "react/jsx-runtime";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createClient } from "@supabase/supabase-js";

import {
  buildPaymentListKpiSummary,
  formatPaymentSuccessRate,
  loadPaymentListKpiSummary,
} from "@/lib/payments/paymentListKpiSummary";

describe("paymentListKpiSummary", () => {
  it("formats whole-number success rates without decimals", () => {
    assert.equal(formatPaymentSuccessRate(8, 8), "100%");
    assert.equal(formatPaymentSuccessRate(0, 10), "0%");
  });

  it("formats fractional success rates with one decimal", () => {
    assert.equal(formatPaymentSuccessRate(37, 40), "92.5%");
  });

  it("returns 0% when there are no payments", () => {
    assert.equal(formatPaymentSuccessRate(0, 0), "0%");
  });


});


describe("payment KPI loading", () => {
  type Row = { net_amount?: number | string | null; currency?: string | null; archived_at?: string | null; amount: number | string | null; status: string | null; client_id: string | null };
  function fixture(rows: Row[], failOffset?: number) {
    const requests: URL[] = [];
    const client = createClient("https://example.supabase.co", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (input) => {
        const url = new URL(String(input));
        requests.push(url);
        const offset = Number(url.searchParams.get("offset") ?? 0);
        if (offset === failOffset) return new Response(JSON.stringify({ code: "XX000", message: "Payment scan failed" }), { status: 500 });
        return new Response(JSON.stringify(rows.filter(row => !row.archived_at).map(row => ({ ...row, currency: row.currency ?? "USD" })).slice(offset, offset + 1000)));
      } },
    });
    return { client, requests };
  }

  it("aggregates all statuses and distinct clients with one scoped dataset request", async () => {
    const { client, requests } = fixture([
      { amount: "10.5", status: "completed", client_id: "a" },
      { amount: 20, status: "paid", client_id: "a" },
      { amount: 30, status: null, client_id: null },
      { amount: 100, status: "failed", client_id: "b" },
      { amount: 200, status: "pending", client_id: "b" },
      { amount: 300, status: "refunded", client_id: "c" },
    ]);
    assert.deepEqual(await loadPaymentListKpiSummary(client, "workspace-1"), {
      totalPayments: 6, totalAmountPaidByCurrency: [{ currency: "USD", amount: 60.5 }], uniqueClients: 1, successRateLabel: "50%",
    });
    assert.equal(requests.length, 1);
    const url = requests[0];
    assert.equal(url.pathname, "/rest/v1/payments_view");
    assert.equal(url.searchParams.get("select"), "amount,net_amount,status,client_id,currency");
    assert.equal(url.searchParams.get("workspace_id"), "eq.workspace-1");
    assert.equal(url.searchParams.get("archived_at"), "is.null");
    assert.equal(url.searchParams.get("order"), "id.asc");
    assert.equal(url.searchParams.get("or"), null);
  });

  it("aggregates beyond the first 1000 rows rather than the visible ledger page", async () => {
    const { client, requests } = fixture([
      ...Array.from({ length: 1000 }, () => ({ amount: "2", status: "completed", client_id: "a" })),
      { amount: "3.5", status: "paid", client_id: "b" },
      { amount: 900, status: "failed", client_id: "b" },
    ]);
    assert.deepEqual(await loadPaymentListKpiSummary(client, "workspace-1"), {
      totalPayments: 1002, totalAmountPaidByCurrency: [{ currency: "USD", amount: 2003.5 }], uniqueClients: 2, successRateLabel: "99.9%",
    });
    assert.equal(requests.length, 2);
    assert.equal(requests[1].searchParams.get("offset"), "1000");
  });

  it("returns zero metrics for no active payments", async () => {
    const { client } = fixture([]);
    assert.deepEqual(await loadPaymentListKpiSummary(client, "workspace-1"), {
      totalPayments: 0, totalAmountPaidByCurrency: [], uniqueClients: 0, successRateLabel: "0%",
    });
  });


  it("uses net-effective amounts and successful direct client ownership, excluding archived and unknown states", async () => {
    const { client } = fixture([
      { amount: 100, net_amount: 90, currency: "USD", status: "completed", client_id: "a" },
      { amount: 20, net_amount: 0, currency: "EUR", status: "paid", client_id: "a" },
      { amount: 30, net_amount: null, currency: "JOD", status: null, client_id: "b" },
      { amount: 999, currency: "SAR", status: "processing", client_id: "c" },
      { amount: 999, currency: "SAR", status: "completed", client_id: "c", archived_at: "2026-01-01" },
      { amount: 5, currency: "USD", status: "paid", client_id: null },
    ]);
    assert.deepEqual(await loadPaymentListKpiSummary(client, "workspace-1"), {
      totalPayments: 5,
      totalAmountPaidByCurrency: [{ currency: "JOD", amount: 30 }, { currency: "USD", amount: 95 }],
      uniqueClients: 2, successRateLabel: "80%",
    });
  });

  it("rejects a failed later page rather than returning partial metrics", async () => {
    const { client } = fixture(Array.from({ length: 1000 }, () => ({ amount: 2, status: "completed", client_id: "a" })), 1000);
    await assert.rejects(loadPaymentListKpiSummary(client, "workspace-1"), { message: "Payment scan failed" });
  });
});

// Exercise the server page with real PostgREST query construction and a fake HTTP boundary.
describe("Payments page loading", () => {
  const code = ts.transpileModule(readFileSync("app/[workspaceId]/payments/page.tsx", "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
  }).outputText;

  async function render(options: {
    kpiFailure?: boolean; listFailure?: boolean; settingsFailure?: boolean;
    noActivePayments?: boolean; noPayments?: boolean;
    search?: Record<string, string>;
  } = {}) {
    const requests: URL[] = [];
    const logs: unknown[][] = [];
    const timezones: unknown[] = [];
    let release!: () => void;
    const allStarted = new Promise<void>(resolve => { release = resolve; });
    const client = createClient("https://example.supabase.co", "test-key", {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: async (input, init) => {
        const url = new URL(String(input));
        requests.push(url);
        if (requests.length === 4) release();
        // Any sequential dependency between the four requests makes the test time out.
        await allStarted;
        const select = url.searchParams.get("select");
        if (url.pathname.endsWith("/settings")) {
          if (options.settingsFailure) return new Response(JSON.stringify({ message: "settings failed" }), { status: 500 });
          return new Response(JSON.stringify({ timezone: "Asia/Amman", default_currency: "JOD" }));
        }
        if (init?.method === "HEAD") return new Response(null, { headers: { "content-range": "0-0/" + (options.noPayments ? 0 : 65) } });
        const kpi = select === "amount,net_amount,status,client_id,currency";
        if (kpi ? options.kpiFailure : options.listFailure) return new Response(JSON.stringify({ code: "XX000", message: kpi ? "KPI failed" : "list failed" }), { status: 500 });
        if (kpi) return new Response(JSON.stringify(options.noActivePayments || options.noPayments ? [] : [{ amount: 10, status: "completed", client_id: "a", currency: "JOD" }]));
        return new Response(JSON.stringify(options.noActivePayments || options.noPayments ? [] : [{ id: "payment-1", amount: 10, status: "completed", invoices: { invoice_number: "INV-1", clients: { name: "Client" } } }]), {
          headers: { "content-range": "0-0/" + (options.noActivePayments || options.noPayments ? 0 : 42) },
        });
      } },
    });
    const noop = () => null;
    const fallback = new Proxy({ __esModule: true, default: noop }, { get: (target, key) => Reflect.has(target, key) ? Reflect.get(target, key) : noop });
    const deps: Record<string, unknown> = {
      "@/lib/auth/server": { requireWorkspace: async () => {} },
      "@/lib/supabase/server": { supabaseServer: async () => client },
      "@/lib/perf/server": { createRoutePerf: () => ({ time: (_: string, fn: () => unknown) => fn(), finish: noop }), perfTime: (_: string, __: string, fn: () => unknown) => fn() },
      "next/cache": { unstable_noStore: noop },
      "@/lib/payments/paymentBusinessDate": { resolvePaymentBusinessDate: (input: { workspaceTimeZone: unknown }) => { timezones.push(input.workspaceTimeZone); return null; } },
      "@/lib/payments/paymentListKpiSummary": { loadPaymentListKpiSummary },
      "@/lib/format/kpiMoney": { formatKpiMoneyTotals },
      "./_components/PaymentsFilterLinks": { PaymentsFilterLinks: noop, PAYMENTS_SORT_PRESET_LABELS: [], PAYMENTS_STATUS_LABELS: [] },
    };
    const exports: { default?: (props: unknown) => Promise<unknown> } = {};
    runInNewContext(code, { exports, require: (id: string) => id === "react/jsx-runtime" ? jsxRuntime : deps[id] ?? fallback, console: { error: (...args: unknown[]) => logs.push(args) }, process: { env: { NODE_ENV: "test" } } });
    const tree = await exports.default!({ params: Promise.resolve({ workspaceId: "workspace-1" }), searchParams: Promise.resolve(options.search ?? {}) });
    const props: Record<string, unknown>[] = [];
    function walk(node: unknown) {
      if (Array.isArray(node)) { node.forEach(walk); return; }
      if (node && typeof node === "object" && "props" in node) {
        const entry = node.props as Record<string, unknown>;
        props.push(entry); walk(entry.children);
      }
    }
    walk(tree);
    return { props, requests, logs, timezones };
  }

  it("starts four requests together, reuses row count and shares timezone/currency", { timeout: 5000 }, async () => {
    const { props, requests, timezones } = await render();
    assert.equal(requests.length, 4);
    assert.equal(requests.filter(url => url.pathname.endsWith("/settings")).length, 1);
    assert.equal(requests.find(url => url.pathname.endsWith("/settings"))?.searchParams.get("select"), "timezone,default_currency");
    const table = props.find(p => p.rows);
    assert.equal(table?.totalCount, 42);
    assert.equal(table?.totalPages, 5);
    assert.equal(table?.anyPaymentsCount, 65);
    assert.deepEqual(timezones, ["Asia/Amman"]);
    assert.equal(props.find(p => p.label === "Total Amount Paid")?.value, "JOD 10.00");
  });

  it("preserves archived search, ordering and pagination without a second count", { timeout: 5000 }, async () => {
    const { requests, props } = await render({ search: { status: "archived", q: "receipt", page: "2", sort: "amount", dir: "asc" } });
    const rows = requests.find(url => url.searchParams.get("select")?.includes("invoice_number"))!;
    assert.equal(rows.pathname, "/rest/v1/payments");
    assert.equal(rows.searchParams.get("archived_at"), "not.is.null");
    assert.equal(rows.searchParams.get("status"), null);
    assert.equal(rows.searchParams.get("or"), "(transaction_id.ilike.%receipt%,notes.ilike.%receipt%)");
    assert.equal(rows.searchParams.get("offset"), "10");
    assert.equal(rows.searchParams.get("limit"), "10");
    assert.equal(rows.searchParams.get("order"), "amount.asc.nullslast,id.asc");
    assert.equal(props.find(p => p.rows)?.totalCount, 42);
    assert.equal(requests.length, 4);
  });

  it("preserves active status filtering without filtering the workspace KPI scan", { timeout: 5000 }, async () => {
    const { requests } = await render({ search: { status: "failed", q: "client" } });
    const rows = requests.find(url => url.pathname.endsWith("/payments_view") && url.searchParams.get("select") !== "amount,net_amount,status,client_id,currency")!;
    assert.equal(rows.searchParams.get("status"), "eq.failed");
    assert.match(rows.searchParams.get("or")!, /client_name.ilike.%client%/);
    const kpi = requests.find(url => url.searchParams.get("select") === "amount,net_amount,status,client_id,currency")!;
    assert.equal(kpi.searchParams.get("status"), null);
    assert.equal(kpi.searchParams.get("or"), null);
  });

  it("keeps the ledger and logs details when KPIs fail", { timeout: 5000 }, async () => {
    const { props, logs } = await render({ kpiFailure: true });
    assert.ok(props.find(p => p.rows));
    assert.equal(props.filter(p => p.value === "Unavailable").length, 4);
    assert.equal(props.some(p => p.title === "Could not load payments"), false);
    assert.equal(logs.length, 1);
  });

  it("keeps the existing error state when payment rows fail", { timeout: 5000 }, async () => {
    const { props } = await render({ listFailure: true });
    assert.ok(props.find(p => p.title === "Could not load payments"));
  });

  it("uses timezone fallback and unavailable KPIs when settings fail", { timeout: 5000 }, async () => {
    const { props, timezones } = await render({ settingsFailure: true });
    assert.ok(props.find(p => p.rows));
    assert.deepEqual(timezones, [null]);
    assert.equal(props.filter(p => p.value === "Unavailable").length, 4);
  });

  it("keeps archived-only workspaces out of the no-payments empty state", { timeout: 5000 }, async () => {
    const { props } = await render({ noActivePayments: true });
    assert.ok(props.find(p => p.rows));
    assert.equal(props.some(p => p.title === "No payments recorded"), false);
    assert.equal(props.find(p => p.label === "Total Payments")?.value, 0);
  });

  it("shows the no-payments empty state for a truly empty workspace", { timeout: 5000 }, async () => {
    const { props } = await render({ noPayments: true });
    assert.ok(props.find(p => p.title === "No payments recorded"));
  });
});
