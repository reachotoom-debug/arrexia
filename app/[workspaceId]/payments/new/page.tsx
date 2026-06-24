import { redirect } from "next/navigation";
import { PaymentForm } from "../_components/PaymentForm";
import { PaymentFormSchema, type PaymentFormValues } from "@/lib/payments/schema";
import { createPayment } from "../actions";
import { getEligibleClientsForPayments } from "../_lib/eligible";

interface NewPaymentPageProps {
  params: Promise<{ workspaceId: string }>;
}

export default async function NewPaymentPage({
  params,
}: NewPaymentPageProps) {
  const { workspaceId } = await params;

  // Load only eligible clients (invoices will be loaded on-demand when client is selected)
  const eligibleClients = await getEligibleClientsForPayments(workspaceId);
  
  // Map to format expected by PaymentForm (id and name only)
  const clients = eligibleClients.map((c) => ({ id: c.client_id, name: c.name }));

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
      const errorMessage = (parsed.error?.issues ?? []).map((e) => e.message).join("; ") || "Invalid form values";
      throw new Error(errorMessage);
    }

    const result = await createPayment(workspaceId, parsed.data as PaymentFormValues);
    if ("error" in result) {
      throw new Error(result.error);
    }
    redirect(`/${workspaceId}/payments`);
  }

  // Show empty state if no eligible clients (no clients with eligible invoices)
  const showEmptyState = clients.length === 0;

  return (
    <div className="w-full min-w-0">
      {/* Empty state if no eligible clients */}
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
            No eligible clients
          </h3>
          <p className="text-sm text-slate-600">
            There are no clients with eligible invoices for payment recording. Create an invoice, mark it as "Sent", and ensure the client is active and not archived.
          </p>
        </div>
      ) : (
        <PaymentForm
          mode="create"
          clients={clients}
          invoices={[]}
          action={handleCreate}
          workspaceId={workspaceId}
          cancelUrl={`/${workspaceId}/payments`}
        />
      )}
    </div>
  );
}
