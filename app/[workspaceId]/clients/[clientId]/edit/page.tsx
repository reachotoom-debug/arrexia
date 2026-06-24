import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { ClientForm } from "../../_components/ClientForm";
import { type ClientFormValues } from "@/lib/clients/schema";
import { updateClient } from "../../actions";
import { type ActionResult } from "@/lib/actions/result";

interface EditClientPageProps {
  params: Promise<{ workspaceId: string; clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function EditClientPage({
  params,
  searchParams,
}: EditClientPageProps) {
  const { workspaceId, clientId } = await params;
  const resolvedSearchParams = await searchParams;
  const supabase = await supabaseServer();

  const { data: client, error } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .eq("workspace_id", workspaceId)
    .single();

  if (error || !client) {
    notFound();
  }

  // Read returnTo from searchParams, default to clients list
  const returnTo = Array.isArray(resolvedSearchParams.returnTo)
    ? resolvedSearchParams.returnTo[0]
    : resolvedSearchParams.returnTo;
  const cancelUrl = returnTo || `/${workspaceId}/clients`;

  // Map database fields to form values
  const initialData: ClientFormValues = {
    name: client.name,
    email: client.email ?? "",
    phone: client.whatsapp ?? "",
    company: client.company ?? "",
    country: client.country ?? "United States",
    paymentTerms: client.payment_terms?.toString() ?? "30",
    status: client.status === "archived" ? "inactive" : "active",
    notes: client.notes ?? "",
  };

  async function handleUpdate(values: ClientFormValues): Promise<ActionResult> {
    "use server";
    return await updateClient(workspaceId, clientId, values);
  }

  return (
    <div className="mx-auto w-full max-w-2xl min-w-0">
      <ClientForm
        mode="edit"
        initialData={initialData}
        onSubmit={handleUpdate}
        workspaceId={workspaceId}
        cancelUrl={cancelUrl}
      />
    </div>
  );
}
