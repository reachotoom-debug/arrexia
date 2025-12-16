import { notFound, redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { ClientForm } from "../../_components/ClientForm";
import { type ClientFormValues } from "@/lib/clients/schema";
import { updateClient } from "../../actions";

interface EditClientPageProps {
  params: Promise<{ workspaceId: string; clientId: string }>;
}

export default async function EditClientPage({
  params,
}: EditClientPageProps) {
  const { workspaceId, clientId } = await params;
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

  async function handleUpdate(values: ClientFormValues) {
    "use server";
    await updateClient(workspaceId, clientId, values);
    redirect(`/${workspaceId}/clients/${clientId}`);
  }

  return (
    <div className="max-w-2xl mx-auto py-6">
      <ClientForm
        mode="edit"
        initialData={initialData}
        onSubmit={handleUpdate}
        workspaceId={workspaceId}
        cancelUrl={`/${workspaceId}/clients/${clientId}`}
      />
    </div>
  );
}
