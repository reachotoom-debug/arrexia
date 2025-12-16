import { notFound } from "next/navigation";
import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/utils/format-money";

interface PageProps {
  params: Promise<{ workspaceId: string; paymentId: string }>;
}

function formatDate(dateString: string | null | undefined): string {
  if (!dateString) return "—";
  return new Date(dateString).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export default async function PaymentViewPage({ params }: PageProps) {
  const { workspaceId, paymentId } = await params;
  const supabase = await supabaseServer();

  // Fetch payment with client and invoice relations
  const { data: payment, error } = await supabase
    .from("payments")
    .select(`
      *,
      client:clients (
        id,
        name,
        email
      ),
      invoice:invoices (
        id,
        invoice_number,
        amount,
        outstanding_amount
      )
    `)
    .eq("workspace_id", workspaceId)
    .eq("id", paymentId)
    .maybeSingle();

  if (error || !payment) {
    return notFound();
  }

  const amount = Number(payment.amount ?? 0);
  const currency = payment.currency ?? "USD";
  const client = Array.isArray(payment.client) ? payment.client[0] : payment.client;
  const invoice = Array.isArray(payment.invoice) ? payment.invoice[0] : payment.invoice;

  return (
    <div className="max-w-4xl mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Payment details</h1>
          <p className="text-sm text-slate-500">
            Payment for {client?.name ?? "Unknown client"}
          </p>
        </div>
        <Link
          href={`/${workspaceId}/payments/${payment.id}/edit`}
          className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
        >
          Edit payment
        </Link>
      </div>

      {/* Main details card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">Amount</div>
            <div className="text-lg font-semibold text-slate-900">
              {formatMoney(amount, currency)}
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">Status</div>
            <div className="text-sm text-slate-700 capitalize">{payment.status ?? "—"}</div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">Date</div>
            <div className="text-sm text-slate-700">
              {formatDate(payment.payment_date || payment.created_at)}
            </div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">Method</div>
            <div className="text-sm text-slate-700 capitalize">{payment.method ?? "—"}</div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">Provider</div>
            <div className="text-sm text-slate-700">{payment.payment_provider ?? "—"}</div>
          </div>

          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">Invoice</div>
            <div className="text-sm text-slate-700">
              {invoice ? (
                <Link
                  href={`/${workspaceId}/invoices/${invoice.id}`}
                  className="text-blue-600 hover:text-blue-700 hover:underline"
                >
                  {invoice.invoice_number}
                </Link>
              ) : (
                "—"
              )}
            </div>
          </div>

          {payment.transaction_id && (
            <div>
              <div className="text-xs font-medium text-slate-500 mb-1">Transaction ID</div>
              <div className="text-sm text-slate-700 font-mono">{payment.transaction_id}</div>
            </div>
          )}
        </div>

        {payment.notes && (
          <div className="pt-4 border-t border-slate-200">
            <div className="text-xs font-medium text-slate-500 mb-1">Notes</div>
            <p className="mt-1 text-sm text-slate-700 whitespace-pre-wrap">{payment.notes}</p>
          </div>
        )}
      </div>

      {/* Payment history section */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-900 mb-3">Payment history</h2>
        <ul className="space-y-2 text-sm text-slate-600">
          <li>
            <span className="font-medium text-slate-700">Created at:</span>{" "}
            {formatDate(payment.created_at)}
          </li>
          <li>
            <span className="font-medium text-slate-700">Last updated:</span>{" "}
            {formatDate(payment.updated_at)}
          </li>
          <li>
            <span className="font-medium text-slate-700">Current status:</span>{" "}
            <span className="capitalize">{payment.status ?? "—"}</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

