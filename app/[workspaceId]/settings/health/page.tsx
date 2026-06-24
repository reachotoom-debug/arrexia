import { unstable_noStore as noStore } from "next/cache";
import { requireWorkspace } from "@/lib/auth/server";
import { supabaseServer } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { HorizontalScrollArea } from "@/components/table/HorizontalScrollArea";
import { TABLE_BASE, TABLE_MIN_WIDTH_INNER } from "@/components/table/tableShell";
import { AlertTriangle, CheckCircle2 } from "lucide-react";

interface PageProps {
  params: Promise<{ workspaceId: string }>;
}

type InvoiceRow = {
  id: string;
  invoice_number: string | null;
  client_id?: string | null;
  total?: number | null;
};

type InvoiceViewRow = {
  id: string;
  invoice_number: string | null;
  total: number | null;
  paid: number | null;
  outstanding: number | null;
  due_date: string | null;
  base_status: string | null;
  display_status: string | null;
};

type PaymentRow = {
  id: string;
  invoice_id: string | null;
  amount: number | null;
  net_amount: number | null;
  status: string | null;
  payment_date?: string | null;
};

type IssueRow = Record<string, string | number | null>;

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function num(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function isIncludedPaymentStatus(status: string | null): boolean {
  return status === null || status === "completed" || status === "paid";
}

function buildSectionTable(title: string, rows: IssueRow[], columns: string[]) {
  const issueCount = rows.length;
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {issueCount > 0 ? (
          <Badge variant="destructive" className="inline-flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" />
            {issueCount} issue{issueCount === 1 ? "" : "s"}
          </Badge>
        ) : (
          <Badge variant="secondary" className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            No issues
          </Badge>
        )}
      </div>
      {issueCount === 0 ? (
        <div className="px-4 py-5 text-sm text-slate-500">No inconsistencies detected in this section.</div>
      ) : (
        <HorizontalScrollArea className="w-full" viewportClassName="overflow-x-auto scrollbar-thin scrollbar-transparent">
          <div className={TABLE_MIN_WIDTH_INNER}>
            <table className={TABLE_BASE}>
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  {columns.map((column) => (
                    <th key={column} className="px-3 py-3 text-left font-medium">
                      {column.replaceAll("_", " ")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((row, index) => (
                  <tr key={`${title}-${index}`} className="hover:bg-slate-50">
                    {columns.map((column) => (
                      <td key={column} className="min-w-0 px-3 py-3 text-sm text-slate-700 break-words">
                        {row[column] == null ? "—" : String(row[column])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </HorizontalScrollArea>
      )}
    </section>
  );
}

export default async function HealthPage({ params }: PageProps) {
  noStore();
  const { workspaceId } = await params;

  await requireWorkspace(workspaceId);
  const supabase = await supabaseServer();

  const [invoicesRes, invoicesViewRes, paymentsRes] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, invoice_number, client_id, total")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null),
    supabase
      .from("invoices_view")
      .select("id, invoice_number, total, paid, outstanding, due_date, base_status, display_status")
      .eq("workspace_id", workspaceId),
    supabase
      .from("payments")
      .select("id, invoice_id, amount, net_amount, status, payment_date")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null),
  ]);

  if (invoicesRes.error) {
    throw new Error(`Failed to load invoices: ${invoicesRes.error.message}`);
  }
  if (invoicesViewRes.error) {
    throw new Error(`Failed to load invoices_view: ${invoicesViewRes.error.message}`);
  }
  if (paymentsRes.error) {
    throw new Error(`Failed to load payments: ${paymentsRes.error.message}`);
  }

  const invoices = (invoicesRes.data ?? []) as InvoiceRow[];
  const invoicesView = (invoicesViewRes.data ?? []) as InvoiceViewRow[];
  const payments = (paymentsRes.data ?? []) as PaymentRow[];

  const invoiceIds = new Set(invoices.map((i) => i.id));
  const paymentSumsByInvoice = new Map<string, number>();
  for (const payment of payments) {
    if (!payment.invoice_id || !isIncludedPaymentStatus(payment.status)) continue;
    const amount = Number(payment.net_amount ?? payment.amount ?? 0);
    paymentSumsByInvoice.set(payment.invoice_id, (paymentSumsByInvoice.get(payment.invoice_id) ?? 0) + amount);
  }

  // 1) Data Integrity Checks
  const invoicesWithoutClient: IssueRow[] = invoices
    .filter((inv) => !inv.client_id)
    .map((inv) => ({
      invoice_number: inv.invoice_number ?? inv.id,
      invoice_id: inv.id,
      total: money(Number(inv.total ?? 0)),
    }));

  const duplicatesByNumber = new Map<string, InvoiceRow[]>();
  for (const invoice of invoices) {
    const key = invoice.invoice_number?.trim();
    if (!key) continue;
    const list = duplicatesByNumber.get(key) ?? [];
    list.push(invoice);
    duplicatesByNumber.set(key, list);
  }
  const duplicateInvoiceNumbers: IssueRow[] = [];
  for (const [invoiceNumber, rows] of duplicatesByNumber.entries()) {
    if (rows.length <= 1) continue;
    duplicateInvoiceNumbers.push({
      invoice_number: invoiceNumber,
      occurrences: rows.length,
      invoice_ids: rows.map((r) => r.id).join(", "),
    });
  }

  const paymentsWithoutInvoice: IssueRow[] = payments
    .filter((p) => !p.invoice_id || !invoiceIds.has(p.invoice_id))
    .map((p) => ({
      payment_id: p.id,
      invoice_id: p.invoice_id ?? "NULL",
      amount: money(Number(p.net_amount ?? p.amount ?? 0)),
      status: p.status ?? "NULL",
      payment_date: p.payment_date ?? "—",
    }));

  const paymentsExceedInvoiceTotal: IssueRow[] = [];
  for (const invoice of invoices) {
    const total = Number(invoice.total ?? 0);
    const paid = paymentSumsByInvoice.get(invoice.id) ?? 0;
    if (paid > total + 0.01) {
      paymentsExceedInvoiceTotal.push({
        invoice_number: invoice.invoice_number ?? invoice.id,
        invoice_id: invoice.id,
        invoice_total: money(total),
        payments_total: money(paid),
        over_by: money(paid - total),
      });
    }
  }

  // 2) Financial Consistency
  const viewById = new Map(invoicesView.map((v) => [v.id, v]));
  const financialMismatches: IssueRow[] = [];
  for (const invoice of invoices) {
    const view = viewById.get(invoice.id);
    if (!view) continue;
    const total = Number(view.total ?? invoice.total ?? 0);
    const recomputedPaid = paymentSumsByInvoice.get(invoice.id) ?? 0;
    const viewPaid = Number(view.paid ?? 0);
    const expectedOutstanding = total - recomputedPaid;
    const viewOutstanding = Number(view.outstanding ?? 0);

    const paidDiff = Math.abs(recomputedPaid - viewPaid);
    const outstandingDiff = Math.abs(expectedOutstanding - viewOutstanding);
    if (paidDiff > 0.01 || outstandingDiff > 0.01) {
      financialMismatches.push({
        invoice_number: view.invoice_number ?? invoice.id,
        invoice_id: invoice.id,
        recomputed_paid: money(recomputedPaid),
        view_paid: money(viewPaid),
        expected_outstanding: money(expectedOutstanding),
        view_outstanding: money(viewOutstanding),
        delta: money(Math.max(paidDiff, outstandingDiff)),
      });
    }
  }

  // 3) Status Validation
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const overdueNotMarked: IssueRow[] = invoicesView
    .filter((inv) => {
      if (!inv.due_date) return false;
      if (Number(inv.outstanding ?? 0) <= 0.01) return false;
      if (inv.base_status !== "sent") return false;
      const due = new Date(inv.due_date);
      due.setHours(0, 0, 0, 0);
      return due < today && inv.display_status !== "overdue";
    })
    .map((inv) => ({
      invoice_number: inv.invoice_number ?? inv.id,
      invoice_id: inv.id,
      due_date: inv.due_date ?? "—",
      outstanding: money(Number(inv.outstanding ?? 0)),
      current_status: inv.display_status ?? "NULL",
    }));

  const paidWithOutstanding: IssueRow[] = invoicesView
    .filter((inv) => inv.display_status === "paid" && Number(inv.outstanding ?? 0) > 0.01)
    .map((inv) => ({
      invoice_number: inv.invoice_number ?? inv.id,
      invoice_id: inv.id,
      display_status: inv.display_status ?? "NULL",
      outstanding: money(Number(inv.outstanding ?? 0)),
      paid: money(Number(inv.paid ?? 0)),
      total: money(Number(inv.total ?? 0)),
    }));

  const totalIssues =
    invoicesWithoutClient.length +
    duplicateInvoiceNumbers.length +
    paymentsWithoutInvoice.length +
    paymentsExceedInvoiceTotal.length +
    financialMismatches.length +
    overdueNotMarked.length +
    paidWithOutstanding.length;

  return (
    <div className="w-full min-w-0 space-y-6">
      <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">Health Checks</h1>
            <p className="mt-1 text-sm text-slate-500">
              Workspace-scoped data integrity and consistency diagnostics before production.
            </p>
          </div>
          {totalIssues > 0 ? (
            <Badge variant="destructive" className="inline-flex items-center gap-1 text-sm">
              <AlertTriangle className="h-4 w-4" />
              {num(totalIssues)} total issues
            </Badge>
          ) : (
            <Badge variant="secondary" className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-sm">
              <CheckCircle2 className="h-4 w-4" />
              All checks passed
            </Badge>
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">1) Data Integrity Checks</h2>
        <div className="grid grid-cols-1 gap-4">
          {buildSectionTable("Invoices Without Client", invoicesWithoutClient, ["invoice_number", "invoice_id", "total"])}
          {buildSectionTable("Duplicate Invoice Numbers (Per Workspace)", duplicateInvoiceNumbers, ["invoice_number", "occurrences", "invoice_ids"])}
          {buildSectionTable("Payments Without Invoice", paymentsWithoutInvoice, ["payment_id", "invoice_id", "amount", "status", "payment_date"])}
          {buildSectionTable("Payments Greater Than Invoice Total", paymentsExceedInvoiceTotal, ["invoice_number", "invoice_id", "invoice_total", "payments_total", "over_by"])}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">2) Financial Consistency</h2>
        <div className="grid grid-cols-1 gap-4">
          {buildSectionTable(
            "Recomputed Totals vs invoices_view Mismatches",
            financialMismatches,
            ["invoice_number", "invoice_id", "recomputed_paid", "view_paid", "expected_outstanding", "view_outstanding", "delta"]
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">3) Status Validation</h2>
        <div className="grid grid-cols-1 gap-4">
          {buildSectionTable(
            "Overdue Invoices Not Marked Overdue",
            overdueNotMarked,
            ["invoice_number", "invoice_id", "due_date", "outstanding", "current_status"]
          )}
          {buildSectionTable(
            "Paid Invoices With Outstanding > 0",
            paidWithOutstanding,
            ["invoice_number", "invoice_id", "display_status", "outstanding", "paid", "total"]
          )}
        </div>
      </div>
    </div>
  );
}
