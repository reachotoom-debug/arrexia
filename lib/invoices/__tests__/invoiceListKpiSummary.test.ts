import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createClient } from "@supabase/supabase-js";
import { loadInvoiceListKpiSummary } from "@/lib/invoices/invoiceListKpiSummary";
import { formatKpiMoneyTotals } from "@/lib/format/kpiMoney";

type Row = { base_status: string; outstanding: number; is_overdue: boolean; currency: string | null; archived_at?: string | null };
function fixture(rows: Row[]) {
  const requests: URL[] = [];
  const client = createClient("https://example.supabase.co", "test-key", {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: async (input) => {
      const url = new URL(String(input)); requests.push(url);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      return new Response(JSON.stringify(rows.filter(row => !row.archived_at).slice(offset, offset + 1000)));
    } },
  });
  return { client, requests };
}

describe("invoice portfolio KPIs", () => {
  it("counts all active documents but only collectible balances and canonical overdue invoices", async () => {
    const { client, requests } = fixture([
      { base_status: "draft", outstanding: 900, is_overdue: false, currency: "SAR" },
      { base_status: "void", outstanding: 800, is_overdue: false, currency: "SAR" },
      { base_status: "sent", outstanding: 0, is_overdue: false, currency: "EUR" },
      { base_status: "sent", outstanding: 40, is_overdue: false, currency: "USD" },
      { base_status: "sent", outstanding: 60, is_overdue: true, currency: "USD" },
      { base_status: "sent", outstanding: 100, is_overdue: true, currency: "JOD", archived_at: "2026-01-01" },
    ]);
    assert.deepEqual(await loadInvoiceListKpiSummary(client, "w"), {
      totalInvoices: 5, outstandingByCurrency: [{ currency: "USD", amount: 100 }], overdueInvoices: 1,
    });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].pathname, "/rest/v1/invoices_view");
    assert.equal(requests[0].searchParams.get("workspace_id"), "eq.w");
    assert.equal(requests[0].searchParams.get("archived_at"), "is.null");
    assert.equal(requests[0].searchParams.get("order"), "id.asc");
  });

  it("reads the whole portfolio beyond 1000 records", async () => {
    const { client, requests } = fixture([
      ...Array.from({ length: 1000 }, () => ({ base_status: "draft", outstanding: 100, is_overdue: false, currency: "USD" })),
      { base_status: "sent", outstanding: 50, is_overdue: true, currency: "USD" },
    ]);
    const summary = await loadInvoiceListKpiSummary(client, "w");
    assert.equal(summary.totalInvoices, 1001);
    assert.equal(summary.overdueInvoices, 1);
    assert.deepEqual(summary.outstandingByCurrency, [{ currency: "USD", amount: 50 }]);
    assert.equal(requests.length, 2);
  });

  it("keeps different currencies separate and uses workspace fallback only for missing currency", async () => {
    const { client } = fixture([
      { base_status: "sent", outstanding: 100, is_overdue: true, currency: "USD" },
      { base_status: "sent", outstanding: 70, is_overdue: false, currency: "JOD" },
      { base_status: "sent", outstanding: 5, is_overdue: false, currency: null },
    ]);
    const summary = await loadInvoiceListKpiSummary(client, "w");
    const label = formatKpiMoneyTotals(summary.outstandingByCurrency, "JOD");
    assert.match(label.value, /75\.00/);
    assert.match(label.value, /100\.00/);
    assert.doesNotMatch(label.value, /175\.00/);
    assert.equal(label.detail, "Totals shown separately by currency.");
  });

  it("uses workspace currency for an empty balance and record currency for a single currency", async () => {
    const { client } = fixture([]);
    assert.deepEqual(await loadInvoiceListKpiSummary(client, "w"), { totalInvoices: 0, outstandingByCurrency: [], overdueInvoices: 0 });
    assert.match(formatKpiMoneyTotals([], "JOD").value, /JOD/);
    assert.equal(formatKpiMoneyTotals([{ currency: "USD", amount: 5 }], "JOD").value, "$5.00");
  });
});
