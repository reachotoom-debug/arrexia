import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { formatCurrency } from "@/lib/format/currency";
import { ArchivedBanner } from "@/components/ui/archived-banner";
import { prettyLabel } from "@/lib/formatters/prettyLabel";

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

  // Fetch payment with client and invoice relations from base payments table
  // Must use base payments table (not payments_view) to include archived payments
  const { data: payment, error } = await supabase
    .from("payments")
    .select(`
      id,
      workspace_id,
      invoice_id,
      client_id,
      payment_date,
      amount,
      currency,
      method,
      status,
      transaction_id,
      notes,
      payment_provider,
      created_at,
      updated_at,
      archived_at,
      client:clients!payments_client_id_fkey (
        id,
        name,
        email
      ),
      invoice:invoices (
        id,
        invoice_number,
        amount,
        archived_at
      )
    `)
    .eq("workspace_id", workspaceId)
    .eq("id", paymentId)
    .maybeSingle();

  // Handle query errors
  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.error("[PaymentViewPage] failed to load payment:", error.message);
    }
    
    // Show error state instead of notFound() for debugging
    return (
      <div className="mx-auto w-full max-w-5xl min-w-0">
        <div className="flex flex-col items-center justify-center rounded-xl border border-red-200 bg-red-50 p-8 text-center shadow-sm">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-red-100">
            <svg
              className="h-5 w-5 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-slate-900">Error loading payment</h2>
          <p className="mt-2 max-w-sm text-sm text-slate-600">
            {error.message || "An error occurred while loading the payment."}
          </p>
          {error.code && (
            <p className="mt-1 text-xs text-slate-500">Error code: {error.code}</p>
          )}
          <Link
            href={`/${workspaceId}/payments`}
            className="mt-4 inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Back to payments
          </Link>
        </div>
      </div>
    );
  }

  // Handle payment not found
  if (!payment) {
    // Show "Payment not found" UI
    return (
      <div className="mx-auto w-full max-w-5xl min-w-0">
        <div className="flex flex-col items-center justify-center rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-slate-100">
            <svg
              className="h-5 w-5 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-slate-900">Payment not found</h2>
          <p className="mt-2 max-w-sm text-sm text-slate-500">
            The payment you're looking for doesn't exist or you don't have access to it.
          </p>
          <p className="mt-1 text-xs text-slate-400 font-mono">
            Payment ID: {paymentId} | Workspace ID: {workspaceId}
          </p>
          <Link
            href={`/${workspaceId}/payments`}
            className="mt-4 inline-flex items-center rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            Back to payments
          </Link>
        </div>
      </div>
    );
  }

  const isArchived = payment.archived_at !== null;
  const client = Array.isArray(payment.client) ? payment.client[0] : payment.client;
  const invoice = Array.isArray(payment.invoice) ? payment.invoice[0] : payment.invoice;
  const isInvoiceArchived = invoice?.archived_at !== null;

  const amount = Number(payment.amount ?? 0);
  const currency = payment.currency ?? "USD";

  return (
    <div className="mx-auto w-full max-w-5xl min-w-0 space-y-6">
      {/* Archived Banner */}
      {isArchived && <ArchivedBanner entityType="payment" />}
      {isInvoiceArchived && (
        <div className="rounded-lg border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-medium">Note:</span> The associated invoice is archived.
        </div>
      )}
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Payment details</h1>
          <p className="text-sm text-slate-500">
            Payment for {client?.name ?? "Unknown client"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/${workspaceId}/payments`}
            className="inline-flex items-center rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-200"
          >
            Back to payments
          </Link>
          {payment.invoice_id && (
            <Link
              href={`/${workspaceId}/invoices/${payment.invoice_id}`}
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            >
              View invoice
            </Link>
          )}
          {/* Hide Edit button if payment is archived (read-only) */}
          {!isArchived && (
            <Link
              href={`/${workspaceId}/payments/${payment.id}/edit`}
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700"
            >
              Edit payment
            </Link>
          )}
        </div>
      </div>

      {/* Main details card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <div className="text-xs font-medium text-slate-500 mb-1">Amount</div>
            <div className="text-lg font-semibold text-slate-900">
              {formatCurrency(amount, { currency })}
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
            <div className="text-sm text-slate-700">
              {prettyLabel(payment.method)}
            </div>
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

