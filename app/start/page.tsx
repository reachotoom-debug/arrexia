import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { ensureWorkspaceForUser } from "@/lib/workspaces/ensureWorkspaceForUser";
import { setWorkspacePlan } from "@/lib/billing/setWorkspacePlan";
import type { WorkspacePlan } from "@/lib/billing/plans";

type SearchParams = Promise<Record<string, string | string[] | undefined>> | undefined;

function parsePlan(searchParams: Record<string, string | string[] | undefined> | undefined): WorkspacePlan {
  const raw = searchParams?.plan;
  const planValue = Array.isArray(raw) ? raw[0] : raw;
  if (planValue === "starter" || planValue === "pro") return planValue;
  return "free";
}

export default async function StartPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const resolvedSearch = searchParams ? await searchParams : undefined;
  const plan = parsePlan(resolvedSearch);

  // Check authentication - redirect to register if not authenticated
  // (We use direct supabase check instead of requireUser because we want to redirect to /register, not /login)
  const supabase = await supabaseServer();
  const { data: { user }, error } = await supabase.auth.getUser();

  if (!user || error) {
    redirect("/register");
  }

  // User is authenticated, proceed with workspace setup
  // ensureWorkspaceForUser creates workspace and workspace_members entry if needed
  const workspaceId = await ensureWorkspaceForUser(user.id);
  
  // Ensure workspace_plans row exists
  await setWorkspacePlan(workspaceId, plan);
  
  redirect(`/${workspaceId}/dashboard`);
}
