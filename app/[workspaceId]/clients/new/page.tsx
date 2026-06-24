import { ClientForm } from "../_components/ClientForm";
import { type ClientFormValues } from "@/lib/clients/schema";
import { createClient } from "../actions";
import { type ActionResult } from "@/lib/actions/result";

interface NewClientPageProps {
  params: Promise<{ workspaceId: string }>;
}

export default async function NewClientPage({
  params,
}: NewClientPageProps) {
  const { workspaceId } = await params;

  async function handleCreate(values: ClientFormValues): Promise<ActionResult> {
    "use server";
    return await createClient(workspaceId, values);
  }

  return (
    <div className="mx-auto w-full max-w-2xl min-w-0">
      <ClientForm
        mode="create"
        onSubmit={handleCreate}
        workspaceId={workspaceId}
        cancelUrl={`/${workspaceId}/clients`}
      />
    </div>
  );
}
