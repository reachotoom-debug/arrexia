import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/server";
import { ensureWorkspaceForUser } from "@/lib/workspaces/ensureWorkspaceForUser";
import { setWorkspacePlan } from "@/lib/billing/setWorkspacePlan";
import type { WorkspacePlan } from "@/lib/billing/getWorkspacePlan";

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

  try {
    const { user } = await requireUser();
    const workspaceId = await ensureWorkspaceForUser(user.id);
    await setWorkspacePlan(workspaceId, plan);
    redirect(`/${workspaceId}/dashboard`);
  } catch {
    const nextUrl = `/start?plan=${plan}`;
    redirect(`/register?next=${encodeURIComponent(nextUrl)}`);
  }
}
