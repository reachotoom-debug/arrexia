import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { PaymentForm } from "../../_components/PaymentForm";
import { PaymentFormSchema, type PaymentFormValues } from "@/lib/payments/schema";
import { updatePayment } from "../../actions";
import { getEligibleInvoicesForClient } from "../../_lib/eligible";
import { getPaymentClients } from "../../_lib/getPaymentClients";

interface EditPaymentPageProps {
  params: Promise<{ workspaceId: string; paymentId: string }>;
}

export default async function EditPaymentPage({
  params,
}: EditPaymentPageProps) {
  const { workspaceId, paymentId } = await params;
  const supabase = await supabaseServer();

  // Load payment - need invoice_id, client_id, archived_at, payment_provider, and invoice archived_at
  const { data: payment, error: paymentError } = await supabase
    .from("payments")
    .select(`
      id, 
      invoice_id, 
      client_id, 
      amount, 
      payment_date, 
      created_at, 
      method, 
      status, 
      transaction_id, 
      notes,
      payment_provider,
      archived_at,
      invoice:invoices (
        id,
        invoice_number,
        archived_at
      ),
      clients (
        id,
        name
      )
    `)
    .eq("id", paymentId)
    .eq("workspace_id", workspaceId)
    .single();

  if (paymentError || !payment) {
    if (process.env.NODE_ENV === "development") {
      console.error("[EditPaymentPage] payment load error:", paymentError);
    }
    notFound();
  }

  // Check if payment is archived - if so, redirect to detail page (read-only)
  const isPaymentArchived = payment.archived_at !== null;
  if (isPaymentArchived) {
    redirect(`/${workspaceId}/payments/${paymentId}`);
  }

  // Check if invoice is archived (but payment is not) - show warning but allow edit
  const invoice = Array.isArray(payment.invoice) ? payment.invoice[0] : payment.invoice;
  const isInvoiceArchived = invoice?.archived_at !== null;
  
  // Get client name and invoice number for read-only display in edit mode
  const client = Array.isArray(payment.clients) ? payment.clients[0] : payment.clients;
  const clientName = client?.name || null;
  const invoiceNumber = invoice?.invoice_number || null;

  // Check if client is archived or inactive (for warning banner)
  let isClientArchived = false;
  let isClientInactive = false;
  if (payment.client_id) {
    const { data: clientRow } = await supabase
      .from("clients")
      .select("archived_at, is_active")
      .eq("id", payment.client_id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    
    isClientArchived = clientRow?.archived_at !== null;
    isClientInactive = clientRow?.is_active === false;
  }

  if (!payment.invoice_id || !payment.client_id) {
    if (process.env.NODE_ENV === "development") {
      console.error("[EditPaymentPage] payment missing invoice_id or client_id", {
        paymentId,
        invoice_id: payment.invoice_id,
        client_id: payment.client_id,
      });
    }
    notFound();
  }

  // Load clients and eligible invoices in parallel
  // Load clients - include payment's client even if inactive/archived (for edit mode)
  // Load eligible invoices for the payment's client, including current invoice if not eligible
  // Invoice dropdown MUST show the linked invoice - do not re-filter it out by outstanding > 0
  // This ensures edit payment page always shows the invoice that the payment is linked to
  const [clients, eligibleInvoices] = await Promise.all([
    getPaymentClients(workspaceId, payment.client_id),
    getEligibleInvoicesForClient(
      workspaceId,
      payment.client_id,
      payment.invoice_id // Include current invoice even if not eligible (e.g., fully paid)
    ),
  ]);

  // Map to PaymentForm expected format
  // Invoice dropdown shows: invoice number + outstanding + currency
  // Ensure the linked invoice is always included, even if it has outstanding = 0
  const invoices = eligibleInvoices.map((inv: {
    id: string;
    client_id: string | null;
    invoice_number: string;
    status: string | null;
    outstanding_amount: number;
    currency?: string;
    forcedInclude?: boolean;
  }) => ({
    id: inv.id,
    client_id: inv.client_id,
    invoice_number: inv.invoice_number,
    status: inv.status,
    outstanding_amount: inv.outstanding_amount,
    currency: inv.currency,
  }));

  // If no invoices, show empty state (should rarely happen for edit page since we include the linked invoice)
  const hasInvoices = invoices.length > 0;
  const showEmptyState = !hasInvoices;

  // Format date from created_at to YYYY-MM-DD
  const formatDate = (dateString: string | Date) => {
    const d = new Date(dateString);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Normalize method to match select option values (lowercase)
  const normalizedMethod = payment.method
    ? (payment.method.toLowerCase() as "cash" | "bank_transfer" | "card" | "check" | "other")
    : "cash";

  // Normalize payment_provider to match select option values (exact match or empty)
  const normalizedProvider = payment.payment_provider
    ? String(payment.payment_provider).trim()
    : "";

  const initialData: PaymentFormValues = {
    clientId: payment.client_id,
    invoiceId: payment.invoice_id,
    amount: Number(payment.amount),
    date: formatDate(payment.payment_date || payment.created_at), // Use payment_date if available, fallback to created_at
    method: normalizedMethod,
    status: payment.status as "pending" | "completed" | "failed" | "refunded",
    transactionId: payment.transaction_id ?? null,
    notes: payment.notes ?? null,
    payment_provider: normalizedProvider,
  };

  async function handleUpdate(formData: FormData) {
    "use server";
    // Normalize FormData values: empty strings -> null for optional fields
    const raw = {
      clientId: formData.get("clientId"),
      invoiceId: (String(formData.get("invoiceId") ?? "").trim() || null),
      amount: Number(formData.get("amount") ?? 0),
      date: String(formData.get("date") ?? ""),
      method: String(formData.get("method") ?? ""),
      status: String(formData.get("status") ?? ""),
      transactionId: (String(formData.get("transactionId") ?? "").trim() || null),
      notes: (String(formData.get("notes") ?? "").trim() || null),
      payment_provider: (String(formData.get("payment_provider") ?? "").trim() || ""),
    };

    const parsed = PaymentFormSchema.safeParse(raw);
    if (!parsed.success) {
      const errorMessage = (parsed.error?.issues ?? []).map((e) => e.message).join("; ") || "Invalid form values";
      throw new Error(errorMessage);
    }

    const result = await updatePayment(workspaceId, paymentId, parsed.data as PaymentFormValues);
    if (result && "error" in result) {
      throw new Error(result.error);
    }
    redirect(`/${workspaceId}/payments`);
  }

  return (
    <div className="mx-auto w-full max-w-2xl min-w-0 space-y-4">
      {/* Warning banners for archived/inactive client or invoice */}
      {isClientArchived && (
        <div className="rounded-lg border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-medium">Note:</span> The associated client is archived.
        </div>
      )}
      {isClientInactive && !isClientArchived && (
        <div className="rounded-lg border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-medium">Note:</span> The associated client is inactive.
        </div>
      )}
      {isInvoiceArchived && (
        <div className="rounded-lg border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <span className="font-medium">Note:</span> The associated invoice is archived.
        </div>
      )}
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
        <>
          <PaymentForm
            mode="edit"
            initialData={initialData}
            clients={clients}
            invoices={invoices}
            action={handleUpdate}
            workspaceId={workspaceId}
            cancelUrl={`/${workspaceId}/payments/${paymentId}`}
            clientName={clientName || undefined}
            invoiceNumber={invoiceNumber || undefined}
          />
        </>
      )}
    </div>
  );
}

