import { redirect } from "next/navigation";
import { PaymentForm } from "../_components/PaymentForm";
import { PaymentFormSchema, type PaymentFormValues } from "@/lib/payments/schema";
import { createPayment } from "../actions";
import { getEligibleClientsForPayments } from "../_lib/eligible";
import { loadWorkspaceSettings } from "@/lib/settings/loadSettings";
import { getWorkspaceCalendarDateNow } from "@/lib/datetime/workspaceCalendar";
import { resolveWorkspaceBusinessDate } from "@/lib/invoices/workspaceInvoiceAging";

interface NewPaymentPageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}

function readSearchParam(
  value: string | string[] | undefined
): string | undefined {
  if (Array.isArray(value)) return value[0];
  return value;
}

export default async function NewPaymentPage({
  params,
  searchParams,
}: NewPaymentPageProps) {
  const { workspaceId } = await params;
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const prefillClientId = readSearchParam(resolvedSearchParams.clientId);
  const prefillInvoiceId = readSearchParam(resolvedSearchParams.invoiceId);
  const returnTo = readSearchParam(resolvedSearchParams.returnTo);

  const settings = await loadWorkspaceSettings(workspaceId);
  const defaultPaymentDate =
    getWorkspaceCalendarDateNow(settings.timezone) ??
    resolveWorkspaceBusinessDate(new Date(), settings.timezone);

  const eligibleClients = await getEligibleClientsForPayments(workspaceId);
  const clients = eligibleClients.map((c) => ({ id: c.client_id, name: c.name }));

  const prefillClientAllowed =
    prefillClientId != null &&
    clients.some((client) => client.id === prefillClientId);

  const initialData: PaymentFormValues | undefined = prefillClientAllowed
    ? {
        clientId: prefillClientId,
        invoiceId: prefillInvoiceId ?? "",
        amount: 0,
        date: defaultPaymentDate,
        method: "cash",
        status: "completed",
        transactionId: "",
        notes: "",
        payment_provider: "",
      }
    : undefined;

  const cancelUrl =
    returnTo && returnTo.startsWith(`/${workspaceId}/`)
      ? returnTo
      : `/${workspaceId}/payments`;

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

    const redirectTo = readSearchParam(
      formData.get("returnTo")?.toString() as string | undefined
    );
    if (redirectTo && redirectTo.startsWith(`/${workspaceId}/`)) {
      redirect(redirectTo);
    }
    redirect(`/${workspaceId}/payments`);
  }

  const showEmptyState = clients.length === 0;

  return (
    <div className="w-full min-w-0">
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
          cancelUrl={cancelUrl}
          defaultPaymentDate={defaultPaymentDate}
          initialData={initialData}
          prefillInvoiceId={prefillClientAllowed ? prefillInvoiceId : undefined}
          returnTo={returnTo}
        />
      )}
    </div>
  );
}
