import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import Link from "next/link";
import { formatMoney } from "@/lib/invoices/utils";
import { getPaymentTermsLabel } from "@/lib/utils/payment-terms";
import { KPI } from "@/app/[workspaceId]/dashboard/_components/KPI";

const ORGANIZATION_ID = "05d2d292-d95b-44f4-b774-22f10068124f";

interface ClientPageProps {
  params: Promise<{ workspaceId: string; clientId: string }>;
}

export default async function ClientPage({ params }: ClientPageProps) {
  const { workspaceId, clientId } = await params;
  const supabase = await supabaseServer();

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .eq("workspace_id", workspaceId)
    .single();

  if (clientError || !client) {
    notFound();
  }

  // Fetch client invoices - use derived fields from database
  const { data: invoices } = await supabase
    .from("invoices")
    .select(
      `
      id,
      invoice_number,
      status,
      issue_date,
      due_date,
      currency,
      amount,
      total_paid,
      outstanding_amount,
      payment_state
    `
    )
    .eq("client_id", clientId)
    .eq("organization_id", ORGANIZATION_ID)
    .neq("status", "void") // Exclude void invoices from client stats
    .order("issue_date", { ascending: false });

  // Use derived fields from database
  const invoicesWithTotals = (invoices || []).map((invoice) => ({
    ...invoice,
    total: Number(invoice.amount ?? 0),
    paid: Number(invoice.total_paid ?? 0),
    outstanding: Number(invoice.outstanding_amount ?? 0),
  }));

  // Calculate metrics - exclude void invoices
  const totalInvoices = invoicesWithTotals.length;
  const totalBilled = invoicesWithTotals.reduce(
    (sum, inv) => sum + inv.total,
    0
  );
  const totalPaid = invoicesWithTotals.reduce((sum, inv) => sum + inv.paid, 0);
  const outstandingBalance = invoicesWithTotals.reduce(
    (sum, inv) => sum + inv.outstanding,
    0
  );

  const getStatusBadge = (status: string) => {
    const statusLower = status.toLowerCase();
    if (statusLower === "paid") {
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    } else if (statusLower === "overdue") {
      return "bg-red-50 text-red-700 border-red-200";
    } else if (statusLower === "sent") {
      return "bg-blue-50 text-blue-700 border-blue-200";
    } else if (statusLower === "partial") {
      return "bg-amber-50 text-amber-700 border-amber-200";
    } else if (statusLower === "void") {
      return "bg-slate-100 text-slate-500 border-slate-200";
    }
    return "bg-slate-50 text-slate-700 border-slate-200";
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {client.name}
          </h1>
          {client.company && (
            <p className="text-sm text-slate-500 mt-1">{client.company}</p>
          )}
          <div className="mt-2">
            <span
              className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${
                client.status === "active"
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                  : "bg-slate-50 text-slate-700 border-slate-200"
              }`}
            >
              {client.status === "archived" ? "inactive" : "active"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/${workspaceId}/clients/${client.id}/edit`}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Edit Client
          </Link>
          <Link
            href={`/${workspaceId}/invoices/new?clientId=${client.id}`}
            className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-blue-700"
          >
            New Invoice
          </Link>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPI title="Total Invoices" value={totalInvoices} />
        <KPI
          title="Total Billed"
          value={formatMoney(totalBilled, "USD")}
        />
        <KPI title="Total Paid" value={formatMoney(totalPaid, "USD")} />
        <KPI
          title="Outstanding Balance"
          value={formatMoney(outstandingBalance, "USD")}
        />
      </div>

      {/* Client Info Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">
          Client Information
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Email</dt>
            <dd className="text-sm text-slate-900 mt-1">
              {client.email ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Phone / WhatsApp</dt>
            <dd className="text-sm text-slate-900 mt-1">
              {client.whatsapp ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Company</dt>
            <dd className="text-sm text-slate-900 mt-1">
              {client.company ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Country</dt>
            <dd className="text-sm text-slate-900 mt-1">
              {client.country ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Payment Terms</dt>
            <dd className="text-sm text-slate-900 mt-1">
              {getPaymentTermsLabel(client.payment_terms)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Status</dt>
            <dd className="text-sm text-slate-900 mt-1 capitalize">
              {client.status === "archived" ? "inactive" : "active"}
            </dd>
          </div>
        </div>
        {client.notes && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <dt className="text-xs text-slate-500 mb-1">Notes</dt>
            <dd className="text-sm text-slate-700 whitespace-pre-line">
              {client.notes}
            </dd>
          </div>
        )}
      </div>

      {/* Client Invoices */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-900">
            Invoices for {client.name}
          </h2>
        </div>
        {invoicesWithTotals.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            <p className="mb-2">No invoices yet</p>
            <p className="text-xs text-slate-400 mb-4">
              Create your first invoice for this client
            </p>
            <Link
              href={`/${workspaceId}/invoices/new?clientId=${client.id}`}
              className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-blue-700"
            >
              New Invoice
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-sm">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 text-left">Invoice #</th>
                  <th className="px-3 py-2 text-left">Issue Date</th>
                  <th className="px-3 py-2 text-left">Due Date</th>
                  <th className="px-3 py-2 text-right">Total Amount</th>
                  <th className="px-3 py-2 text-right">Outstanding</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-right">Open</th>
                </tr>
              </thead>
              <tbody>
                {invoicesWithTotals.map((invoice) => (
                  <tr
                    key={invoice.id}
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-3 py-2 font-medium text-slate-900">
                      {invoice.invoice_number}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700">
                      {formatDate(invoice.issue_date)}
                    </td>
                    <td className="px-3 py-2 text-sm text-slate-700">
                      {formatDate(invoice.due_date)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-slate-900">
                      {formatMoney(invoice.amount ?? invoice.total ?? 0, invoice.currency || "USD")}
                    </td>
                    <td
                      className={`px-3 py-2 text-right font-medium ${
                        invoice.outstanding > 0
                          ? "text-red-600"
                          : invoice.outstanding < 0
                          ? "text-emerald-600"
                          : "text-slate-700"
                      }`}
                    >
                      {formatMoney(
                        Math.abs(invoice.outstanding),
                        invoice.currency || "USD"
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${getStatusBadge(
                          invoice.status
                        )}`}
                      >
                        {invoice.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right text-sm">
                      <Link
                        href={`/${workspaceId}/invoices/${invoice.id}`}
                        className="text-blue-600 hover:text-blue-700"
                      >
                        Open
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
