import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { PaymentForm } from "../../_components/PaymentForm";
import { type PaymentFormValues } from "@/lib/payments/schema";
import { updatePayment } from "../../actions";
import { getEligibleInvoices } from "../../_lib/getEligibleInvoices";

interface EditPaymentPageProps {
  params: Promise<{ workspaceId: string; paymentId: string }>;
}

export default async function EditPaymentPage({
  params,
}: EditPaymentPageProps) {
  const { workspaceId, paymentId } = await params;
  const supabase = await supabaseServer();

  // Load payment - need invoice_id and client_id
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select("id, invoice_id, client_id, amount, payment_date, created_at, method, status, transaction_id, notes")
    .eq("id", paymentId)
    .single();

  if (paymentError || !payment) {
    console.error("[EditPaymentPage] payment load error:", paymentError);
    notFound();
  }

  if (!payment.invoice_id || !payment.client_id) {
    console.error("[EditPaymentPage] payment missing invoice_id or client_id", {
      paymentId,
      invoice_id: payment.invoice_id,
      client_id: payment.client_id,
    });
    notFound();
  }

  // Load clients
  const { data: clientsData } = await supabase
    .from("clients")
    .select("id, name")
    .eq("workspace_id", workspaceId);

  const clients =
    clientsData?.map((c) => ({ id: c.id, name: c.name })) ?? [];

  // Load eligible invoices for the payment's client, including current invoice if not eligible
  // Invoice dropdown MUST show the linked invoice - do not re-filter it out by outstanding > 0
  // This ensures edit payment page always shows the invoice that the payment is linked to
  const { invoices: eligibleInvoices, error: invoicesError } = await getEligibleInvoices(
    workspaceId,
    payment.client_id,
    payment.invoice_id // Include current invoice even if not eligible (e.g., fully paid)
  );

  // Map to PaymentForm expected format
  // Invoice dropdown shows: invoice number + outstanding + currency
  // Ensure the linked invoice is always included, even if it has outstanding = 0
  const invoices = eligibleInvoices.map((inv) => ({
    id: inv.id,
    client_id: inv.client_id,
    invoice_number: inv.invoice_number,
    status: inv.status,
    outstanding_amount: inv.outstanding_amount,
    currency: inv.currency,
  }));

  // Verify the linked invoice is in the list (should be handled by getEligibleInvoices, but double-check)
  if (payment.invoice_id && !invoices.some((inv) => inv.id === payment.invoice_id)) {
    console.warn("[EditPaymentPage] linked invoice not in eligible list, this should not happen", {
      invoiceId: payment.invoice_id,
      eligibleCount: invoices.length,
    });
  }

  // If no invoices and no error, show empty state instead of error
  // (This should rarely happen for edit page since we include the linked invoice)
  const hasInvoices = invoices.length > 0;
  const showEmptyState = !hasInvoices && !invoicesError;

  // Format date from created_at to YYYY-MM-DD
  const formatDate = (dateString: string | Date) => {
    const d = new Date(dateString);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const initialData: PaymentFormValues = {
    clientId: payment.client_id,
    invoiceId: payment.invoice_id,
    amount: Number(payment.amount),
    date: formatDate(payment.payment_date || payment.created_at), // Use payment_date if available, fallback to created_at
    method: payment.method as "cash" | "bank_transfer" | "card" | "check" | "other",
    status: payment.status as "pending" | "completed" | "failed" | "refunded",
    transactionId: payment.transaction_id ?? null,
    notes: payment.notes ?? null,
  };

  async function handleUpdate(values: PaymentFormValues) {
    "use server";
    const result = await updatePayment(workspaceId, paymentId, values);
    if (result && "error" in result) {
      throw new Error(result.error);
    }
    redirect(`/${workspaceId}/payments`);
  }

  return (
    <div className="max-w-2xl mx-auto py-6">
      {/* Empty state if no invoices (should not happen for edit, but handle gracefully) */}
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
            No invoices available
          </h3>
          <p className="text-sm text-slate-600 mb-4">
            Unable to load invoices for this payment. The linked invoice may have been deleted.
          </p>
        </div>
      ) : (
        <PaymentForm
          mode="edit"
          initialData={initialData}
          clients={clients}
          invoices={invoices}
          onSubmit={handleUpdate}
          workspaceId={workspaceId}
          cancelUrl={`/${workspaceId}/payments`}
        />
      )}
    </div>
  );
}

