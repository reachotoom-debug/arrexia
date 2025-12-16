import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { generateNextInvoiceNumber } from "@/lib/invoices/numbering";
import { InvoiceForm } from "../_components/InvoiceForm";
import { type InvoiceFormValues } from "@/lib/invoices/schema";
import { createInvoice } from "../actions";

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
    .order("name", { ascending: true });

  const clients =
    clientsData?.map((c) => ({ id: c.id, name: c.name, company: c.company })) ?? [];

  const prefilledClient =
    initialClientId && clients
      ? clients.find((c) => c.id === initialClientId) ?? null
      : null;

  let generatedInvoiceNumber = "INV-0001";
  try {
    generatedInvoiceNumber = await generateNextInvoiceNumber(
      supabase as any,
      "05d2d292-d95b-44f4-b774-22f10068124f"
    );
  } catch (e) {
    console.error("[NewInvoicePage] failed to generate invoice number", e);
  }

  async function handleCreate(values: InvoiceFormValues) {
    "use server";
    console.log("[handleCreate] server action called");
    const invoiceId = await createInvoice(workspaceId, values);
    console.log("[handleCreate] invoice created, redirecting to", invoiceId);
    redirect(`/${workspaceId}/invoices/${invoiceId}`);
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
    />
  );
}
