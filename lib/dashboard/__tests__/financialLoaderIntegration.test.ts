import assert from "node:assert/strict";
import { it, mock } from "node:test";
import * as server from "@/lib/supabase/server";
import { getDashboardCurrencies, getDashboardData, getDashboardSummary } from "@/app/[workspaceId]/dashboard/_utils/dataLoader";
import { getEligibleReminders } from "@/lib/reminders/getEligibleReminders";
import { checkRuleOccurrenceDuplicateBeforeSend } from "@/lib/reminders/ruleOccurrenceGuard";

type Row = Record<string, unknown>;
function database(tables: Record<string, Row[]>, failTable?: string) {
  return { from(table: string) {
    let from = 0, to = Infinity, single = false;
    const filters: Array<(row: Row) => boolean> = [];
    const query = {
      select() { return query; },
      eq(key: string, value: unknown) { filters.push(r => r[key] === value); return query; },
      is(key: string, value: unknown) { filters.push(r => (r[key] ?? null) === value); return query; },
      gt(key: string, value: number) { filters.push(r => Number(r[key]) > value); return query; },
      gte() { return query; },
      not(key: string, operator: string, value: unknown) { filters.push(r => operator === "is" ? r[key] != null : !String(value).includes(String(r[key]))); return query; },
      order() { return query; },
      range(start: number, end: number) { from = start; to = end; return query; },
      maybeSingle() { single = true; return query; },
      then(resolve: (value: unknown) => unknown) {
        if (table === failTable && from > 0) return Promise.resolve(resolve({ data: null, error: new Error("later page failure") }));
        const data = (tables[table] ?? []).filter(r => filters.every(f => f(r))).slice(from, to + 1);
        return Promise.resolve(resolve({ data: single ? data[0] ?? null : data, error: null }));
      },
    };
    return query;
  }};
}
function install(tables: Record<string, Row[]>, failTable?: string) {
  return mock.method(server, "supabaseServer", async () => database(tables, failTable) as never);
}
const settings = [{ workspace_id: "w", default_currency: "USD", timezone: "Asia/Amman" }];
it("draft-only EUR remains in Invoices without creating a second KPI currency", async () => {
  const base = {workspace_id:"w",archived_at:null,total:100,paid:0,outstanding:100};
  const spy = install({settings,invoices_view:[
    {...base,id:"eur",currency:"EUR",base_status:"draft"},
    {...base,id:"usd",currency:"USD",base_status:"sent"},
    {...base,id:"void",currency:"USD",base_status:"void"},
    {...base,id:"archived",currency:"USD",base_status:"sent",archived_at:"2026-10-01"},
  ]});
  try {
    assert.deepEqual(await getDashboardCurrencies("w"),["USD"]);
    const eur = await getDashboardSummary("w","EUR");
    const usd = await getDashboardSummary("w","USD");
    assert.deepEqual(eur.invoiceActivity,{issuedCount:0,draftCount:1,voidCount:0});
    assert.equal(eur.totals.totalOutstanding,0);
    assert.deepEqual(usd.invoiceActivity,{issuedCount:1,draftCount:0,voidCount:1});
    assert.equal(usd.totals.totalOutstanding,100);
  } finally { spy.mock.restore(); }
});
it("currency discovery includes issued and effective-payment activity, excluding draft/void/archive and ineffective payments", async () => {
  const base = {workspace_id:"w",archived_at:null};
  const spy = install({settings,invoices_view:[
    {...base,id:"issued",currency:"USD",base_status:"sent"},
    {...base,id:"draft",currency:"EUR",base_status:"draft"},
    {...base,id:"void",currency:"GBP",base_status:"void"},
    {...base,id:"archived",currency:"JPY",base_status:"sent",archived_at:"2026-10-01"},
  ],payments_view:[
    {...base,id:"p1",currency:"CAD",status:"completed",net_amount:0},
    {...base,id:"p2",currency:"AUD",status:"paid"},
    {...base,id:"p3",currency:"CHF",status:null},
    {...base,id:"p4",currency:"EUR",status:"pending"},
    {...base,id:"p5",currency:"GBP",status:"failed"},
    {...base,id:"p6",currency:"JPY",status:"refunded"},
    {...base,id:"p7",currency:"SEK",status:""},
    {...base,id:"p8",currency:"NOK",status:"completed",archived_at:"2026-10-01"},
    {...base,id:"foreign",currency:"NZD",status:"completed",workspace_id:"other"},
  ]});
  try { assert.deepEqual(await getDashboardCurrencies("w"),["AUD","CAD","CHF","USD"]); }
  finally { spy.mock.restore(); }
});
it("no issued or effective-payment activity retains one default-currency KPI section", async () => {
  const spy = install({settings,invoices_view:[{workspace_id:"w",id:"draft",currency:"EUR",base_status:"draft",archived_at:null}]});
  try { assert.deepEqual(await getDashboardCurrencies("w"),["USD"]); }
  finally { spy.mock.restore(); }
});
it("dashboard loaders separate currencies and place September receipts on August invoices in September beyond 1000 rows", async () => {
  mock.timers.enable({ apis: ["Date"], now: new Date("2026-10-15T12:00:00Z").getTime() });
  const invoice = { workspace_id: "w", client_id: "c", client_name: "Client", base_status: "sent", display_status: "sent", issue_date: "2026-08-10", due_date: "2026-11-10", archived_at: null, client_is_active: true, client_archived_at: null };
  const invoices = Array.from({ length: 1201 }, (_, id) => ({ ...invoice, id: String(id), currency: id === 1200 ? "EUR" : "USD", total: 2, paid: 1, outstanding: 1 }));
  const payments = invoices.map(r => ({ ...r, amount: 1, net_amount: 1, payment_date: "2026-09-17", status: "completed" }));
  const spy = install({ settings, invoices_view: invoices, payments_view: payments, clients: [], reminders: [] });
  try {
    assert.deepEqual(await getDashboardCurrencies("w"), ["EUR", "USD"]);
    const usd = await getDashboardSummary("w", "USD");
    const eur = await getDashboardSummary("w", "EUR");
    assert.equal(usd.totals.totalOutstanding, 1200);
    assert.equal(eur.totals.totalOutstanding, 1);
    assert.equal(usd.trends.collected[9], 0); // August in November–October window
    assert.equal(usd.trends.collected[10], 1200);
    const performance = await getDashboardData("w", "USD");
    assert.equal(performance.series.collectedMonthly.find(r => r.month === "2026-08")?.amount, 0);
    assert.equal(performance.series.collectedMonthly.find(r => r.month === "2026-09")?.amount, 1200);
  } finally { spy.mock.restore(); mock.timers.reset(); }
});
it("dashboard fails explicitly on a later financial page rather than publishing partial totals", async () => {
  const spy = install({ settings, invoices_view: Array.from({ length: 501 }, (_, id) => ({ id, workspace_id: "w", base_status: "sent", archived_at: null })) }, "invoices_view");
  try { await assert.rejects(getDashboardSummary("w", "USD"), /later page failure/); }
  finally { spy.mock.restore(); }
});
it("successful reminder history beyond the first page suppresses a duplicate candidate", async () => {
  const invoice = { id: "i", workspace_id: "w", client_id: "c", due_date: "2026-10-15", outstanding: 100, paid: 0, total: 100, base_status: "sent", client_is_active: true, client_archived_at: null, archived_at: null, clients: { email: "fixture@example.invalid" } };
  const history = Array.from({ length: 1201 }, (_, id) => ({ id, workspace_id: "w", invoice_id: "i", rule_id: "r", scheduled_at: "2026-10-15", status: id === 1200 ? "sent" : "failed", sent_at: "2026-10-15T09:00:00Z", channel: "email" }));
  const rule = { id: "r", workspace_id: "w", name: "Due", trigger_type: "on_due", offset_days: 0, for_status: "sent", is_enabled: true, template_id: "t", reminder_templates: { id: "t", workspace_id: "w", is_enabled: true } };
  const spy = install({ settings, invoices_view: [invoice], reminder_rules: [rule], reminders: history, invoice_delivery_logs: [] });
  try { assert.deepEqual(await getEligibleReminders("w", { evaluationInstant: new Date("2026-10-15T12:00:00Z") }), []); }
  finally { spy.mock.restore(); }
});
it("the final pre-send guard reads a successful occurrence beyond 1000 attempts and rejects incomplete history", async () => {
  const rows = Array.from({ length: 1201 }, (_, id) => ({ id, workspace_id: "w", invoice_id: "i", rule_id: "r", scheduled_at: "2026-10-15", status: id === 1200 ? "sent" : "failed", sent_at: "2026-10-15T09:00:00Z" }));
  const args = { workspaceId: "w", invoiceId: "i", ruleId: "r", triggerType: "on_due", offsetDays: 0, dueDate: "2026-10-15", workspaceTimeZone: "Asia/Amman" };
  const result = await checkRuleOccurrenceDuplicateBeforeSend({ ...args, supabase: database({ reminders: rows }) as never });
  assert.equal(result.blocked, true);
  await assert.rejects(checkRuleOccurrenceDuplicateBeforeSend({ ...args, supabase: database({ reminders: rows }, "reminders") as never }), /later page failure/);
});
