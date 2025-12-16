import { redirect } from "next/navigation";
import { ClientForm } from "../_components/ClientForm";
import { type ClientFormValues } from "@/lib/clients/schema";
import { createClient } from "../actions";

interface NewClientPageProps {
  params: Promise<{ workspaceId: string }>;
}

export default async function NewClientPage({
  params,
}: NewClientPageProps) {
  const { workspaceId } = await params;

  async function handleCreate(values: ClientFormValues) {
    "use server";
    const clientId = await createClient(workspaceId, values);
    redirect(`/${workspaceId}/clients/${clientId}`);
  }

  return (
    <div className="max-w-2xl mx-auto py-6">
      <ClientForm
        mode="create"
        onSubmit={handleCreate}
        workspaceId={workspaceId}
        cancelUrl={`/${workspaceId}/clients`}
      />
    </div>
  );
}
