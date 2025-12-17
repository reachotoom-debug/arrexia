import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { PaymentForm } from "../_components/PaymentForm";
import { PaymentFormSchema, type PaymentFormValues } from "@/lib/payments/schema";
import { createPayment } from "../actions";
import { getEligibleInvoices } from "../_lib/getEligibleInvoices";

interface NewPaymentPageProps {
  params: Promise<{ workspaceId: string }>;
}

export default async function NewPaymentPage({
  params,
}: NewPaymentPageProps) {
  const { workspaceId } = await params;
  const supabase = await supabaseServer();

  const { data: clientsData } = await supabase
    .from("clients")
    .select("id, name")
    .eq("workspace_id", workspaceId);

  const clients =
    clientsData?.map((c) => ({ id: c.id, name: c.name })) ?? [];

  // Use shared helper to get eligible invoices with proper filters
  // Returns { invoices: EligibleInvoice[], error?: string }
  const { invoices: eligibleInvoices, error: invoicesError } = await getEligibleInvoices(workspaceId);

  // Server-side debug log when invoicesError exists
  if (invoicesError) {
    console.error("[NewPaymentPage] invoicesError DEBUG:", {
      workspaceId,
      clientId: null, // No client filter in initial load
      invoicesCount: eligibleInvoices.length,
      error: invoicesError,
    });
  }

  // Map to PaymentForm expected format (already includes all needed fields)
  // Invoice dropdown shows: invoice number + outstanding + currency
  const invoices = eligibleInvoices.map((inv) => ({
    id: inv.id,
    client_id: inv.client_id,
    invoice_number: inv.invoice_number,
    status: inv.status,
    outstanding_amount: inv.outstanding_amount,
    currency: inv.currency,
  }));

  async function handleCreate(formData: FormData) {
    "use server";
    const raw = {
      clientId: formData.get("clientId"),
      invoiceId: formData.get("invoiceId"),
      amount: Number(formData.get("amount") ?? 0),
      date: String(formData.get("date") ?? ""),
      method: String(formData.get("method") ?? ""),
      status: String(formData.get("status") ?? ""),
      transactionId: formData.get("transactionId") ? String(formData.get("transactionId")) : null,
      notes: formData.get("notes") ? String(formData.get("notes")) : null,
      payment_provider: formData.get("payment_provider")
        ? String(formData.get("payment_provider"))
        : "",
    };

    const parsed = PaymentFormSchema.safeParse(raw);
    if (!parsed.success) {
      throw new Error(parsed.error.errors.map((e) => e.message).join("; "));
    }

    const result = await createPayment(workspaceId, parsed.data as PaymentFormValues);
    if ("error" in result) {
      throw new Error(result.error);
    }
    redirect(`/${workspaceId}/payments`);
  }

  const isDev = process.env.NODE_ENV === "development";

  // If no invoices and no error, show empty state instead of error
  const hasInvoices = invoices.length > 0;
  const showEmptyState = !hasInvoices && !invoicesError;

  return (
    <div className="max-w-2xl mx-auto py-6">
      {/* Non-blocking warning when invoicesError exists */}
      {invoicesError && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex items-start">
            <div className="flex-shrink-0">
              <svg
                className="h-5 w-5 text-amber-400"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-sm font-medium text-amber-800">
                Could not load invoices. Check migrations / invoices_view columns.
              </h3>
              {isDev && invoicesError && (
                <div className="mt-2 text-xs">
                  <p className="font-mono text-amber-700 bg-amber-100 p-2 rounded border border-amber-200 break-all">
                    {invoicesError}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Empty state if no invoices (not an error) */}
      {showEmptyState ? (
        <div className="rounded-xl border border-slate-200 bg-white p-8 text-center">
          <div className="mb-4 rounded-full bg-slate-100 p-4 inline-block">
            <svg
              className="h-8 w-8 text-slate-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-slate-900 mb-2">
            No eligible invoices
          </h3>
          <p className="text-sm text-slate-600">
            There are no invoices available for payment recording. Create an invoice and mark it as "Sent" to record payments.
          </p>
        </div>
      ) : (
        <PaymentForm
          mode="create"
          clients={clients}
          invoices={invoices}
          action={handleCreate}
          workspaceId={workspaceId}
          cancelUrl={`/${workspaceId}/payments`}
          invoicesError={invoicesError}
        />
      )}
    </div>
  );
}
