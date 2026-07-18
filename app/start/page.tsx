import Link from "next/link";
import { redirect } from "next/navigation";
import { AUTH_WORKSPACE_SETUP_FAILED_MESSAGE } from "@/lib/auth/authErrors";
import { setWorkspacePlan } from "@/lib/billing/setWorkspacePlan";
import type { WorkspacePlan } from "@/lib/billing/plans";
import { supabaseServer } from "@/lib/supabase/server";
import { ensureWorkspaceForUser } from "@/lib/workspaces/ensureWorkspaceForUser";

type SearchParams = Promise<Record<string, string | string[] | undefined>> | undefined;

function parsePlan(searchParams: Record<string, string | string[] | undefined> | undefined): WorkspacePlan {
  const raw = searchParams?.plan;
  const planValue = Array.isArray(raw) ? raw[0] : raw;
  if (planValue === "starter" || planValue === "pro") return planValue;
  return "free";
}

function WorkspaceSetupFailedPanel() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold text-slate-900">Workspace setup failed</h1>
      <p className="text-sm text-slate-600">{AUTH_WORKSPACE_SETUP_FAILED_MESSAGE}</p>
      <div className="flex w-full flex-col gap-3">
        <Link
          href="/start"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Try again
        </Link>
        <Link
          href="/login"
          className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  );
}

export default async function StartPage({
  searchParams,
}: {
  searchParams?: SearchParams;
}) {
  const resolvedSearch = searchParams ? await searchParams : undefined;
  const plan = parsePlan(resolvedSearch);

  const supabase = await supabaseServer();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!user || error) {
    redirect("/register");
  }

  try {
    const workspaceId = await ensureWorkspaceForUser(user.id);
    await setWorkspacePlan(workspaceId, plan);
    redirect(`/${workspaceId}/dashboard`);
  } catch (bootstrapError) {
    if (process.env.NODE_ENV === "development") {
      const message =
        bootstrapError instanceof Error ? bootstrapError.message : "Unknown workspace setup error";
      console.error("[start/workspace-bootstrap]", { userId: user.id, error: message });
    }

    return <WorkspaceSetupFailedPanel />;
  }
}
