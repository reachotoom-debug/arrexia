"use server";

import { revalidatePath } from "next/cache";
import { supabaseServer } from "@/lib/supabase/server";
import {
  ClientFormSchema,
  type ClientFormValues,
} from "@/lib/clients/schema";

export async function createClient(
  workspaceId: string,
  rawValues: ClientFormValues
) {
  const parsed = ClientFormSchema.parse(rawValues);
  const supabase = await supabaseServer();

  // Convert paymentTerms string to number
  const paymentTermsNum =
    parsed.paymentTerms === "custom" || !parsed.paymentTerms
      ? 30
      : parseInt(parsed.paymentTerms, 10);

  const { data, error } = await supabase
    .from("clients")
    .insert({
      workspace_id: workspaceId,
      name: parsed.name,
      email: parsed.email ?? null,
      whatsapp: parsed.phone ?? null, // Map phone to whatsapp column
      company: parsed.company ?? null,
      country: parsed.country,
      payment_terms: paymentTermsNum,
      status: parsed.status === "active" ? "active" : "archived",
      notes: parsed.notes ?? null,
    })
    .select("id")
    .single();

  if (error || !data) {
    console.error("[createClient] insert failed:", error);
    throw new Error(`Failed to create client: ${error?.message}`);
  }

  revalidatePath(`/${workspaceId}/clients`);
  revalidatePath(`/${workspaceId}/dashboard`);
  return data.id;
}

export async function updateClient(
  workspaceId: string,
  clientId: string,
  rawValues: ClientFormValues
) {
  const parsed = ClientFormSchema.parse(rawValues);
  const supabase = await supabaseServer();

  // Convert paymentTerms string to number
  const paymentTermsNum =
    parsed.paymentTerms === "custom" || !parsed.paymentTerms
      ? 30
      : parseInt(parsed.paymentTerms, 10);

  const { error } = await supabase
    .from("clients")
    .update({
      name: parsed.name,
      email: parsed.email ?? null,
      whatsapp: parsed.phone ?? null,
      company: parsed.company ?? null,
      country: parsed.country,
      payment_terms: paymentTermsNum,
      status: parsed.status === "active" ? "active" : "archived",
      notes: parsed.notes ?? null,
    })
    .eq("id", clientId)
    .eq("workspace_id", workspaceId);

  if (error) {
    console.error("[updateClient] update failed:", error);
    throw new Error(`Failed to update client: ${error.message}`);
  }

  revalidatePath(`/${workspaceId}/clients`);
  revalidatePath(`/${workspaceId}/clients/${clientId}`);
  revalidatePath(`/${workspaceId}/dashboard`);
}

export async function deleteClient(workspaceId: string, clientId: string) {
  const supabase = await supabaseServer();

  const { error } = await supabase
    .from("clients")
    .delete()
    .eq("id", clientId)
    .eq("workspace_id", workspaceId);

  if (error) {
    console.error("[deleteClient] delete failed:", error);
    throw new Error(`Failed to delete client: ${error.message}`);
  }

  revalidatePath(`/${workspaceId}/clients`);
  revalidatePath(`/${workspaceId}/dashboard`);
}
