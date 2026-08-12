import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { supabaseServer } from "@/lib/supabase/server";
import { InvoiceForm } from "../_components/InvoiceForm";
import { type InvoiceFormValues } from "@/lib/invoices/schema";
import { createInvoice, getNextInvoiceNumber } from "../actions";
import {
  createCreateInvoiceActionInstrumentation,
  isNextRedirectError,
} from "@/lib/invoices/createInvoiceInstrumentation";
import { loadWorkspaceSettings } from "@/lib/settings/loadSettings";
import { getWorkspaceCalendarDateNow } from "@/lib/datetime/workspaceCalendar";
import { resolveWorkspaceBusinessDate } from "@/lib/invoices/workspaceInvoiceAging";

interface NewInvoicePageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<{
    [key: string]: string | string[] | undefined;
  }>;
}

export default async function NewInvoicePage({
  params,
  searchParams,
}: NewInvoicePageProps) {
  const { workspaceId } = await params;
  const resolvedSearchParams = await searchParams;
  const supabase = await supabaseServer();

  const rawClientId = Array.isArray(resolvedSearchParams.clientId)
    ? resolvedSearchParams.clientId[0]
    : resolvedSearchParams.clientId;
  const initialClientId = rawClientId || undefined;

  const { data: clientsData } = await supabase
    .from("clients")
    .select("id, name, company")
    .eq("workspace_id", workspaceId)
    .is("archived_at", null)
    .eq("is_active", true) // Only show active clients
    .order("name", { ascending: true });

  const clients =
    clientsData?.map((c) => ({ id: c.id, name: c.name, company: c.company })) ?? [];

  const prefilledClient =
    initialClientId && clients
      ? clients.find((c) => c.id === initialClientId) ?? null
      : null;

  // Load workspace settings to get default currency
  const settings = await loadWorkspaceSettings(workspaceId);
  const defaultCurrency = settings.payments.defaultCurrency || "USD";
  const defaultIssueDate =
    getWorkspaceCalendarDateNow(settings.timezone) ??
    resolveWorkspaceBusinessDate(new Date(), settings.timezone);

  let generatedInvoiceNumber = "INV-0001";
  try {
    generatedInvoiceNumber = await getNextInvoiceNumber(workspaceId);
  } catch (e) {
    console.error("[NewInvoicePage] failed to generate invoice number", e);
  }

  async function handleCreate(values: InvoiceFormValues) {
    "use server";
    const requestId = randomUUID();
    const actionTimer = createCreateInvoiceActionInstrumentation(workspaceId, requestId);
    actionTimer.mark("START");

    try {
      actionTimer.mark("CREATE_START");
      const result = await createInvoice(workspaceId, values, { requestId });
      actionTimer.mark("CREATE_END");

      if (result && typeof result === "object" && "fieldErrors" in result) {
        actionTimer.mark("END");
        return result;
      }

      actionTimer.mark("REDIRECT_START");
      redirect(`/${workspaceId}/invoices/${result}`);
    } catch (error: unknown) {
      if (isNextRedirectError(error)) {
        actionTimer.mark("REDIRECT_START");
        throw error;
      }
      actionTimer.markError("CREATE_END", error);
      throw error;
    }
  }

  return (
    <InvoiceForm
      mode="create"
      clients={clients}
      generatedInvoiceNumber={generatedInvoiceNumber}
      onSubmit={handleCreate}
      workspaceId={workspaceId}
      prefilledClient={prefilledClient}
      initialClientId={initialClientId}
      currency={defaultCurrency}
      defaultIssueDate={defaultIssueDate}
    />
  );
}
