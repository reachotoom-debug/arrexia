import Link from "next/link";
import { redirect } from "next/navigation";
import { AUTH_WORKSPACE_SETUP_FAILED_MESSAGE } from "@/lib/auth/authErrors";
import { AUTH_ACCOUNT_NOT_ACTIVATED_MESSAGE } from "@/lib/auth/authErrors";
import { buildWorkspaceRecoveryPath } from "@/lib/auth/postLoginRecovery";
import { sanitizeNextPath } from "@/lib/auth/safeNextPath";
import {
  parsePublicSignupTrialPlan,
  type PublicSignupTrialPlan,
} from "@/lib/billing/publicTrialPlan";
import { supabaseServer } from "@/lib/supabase/server";
import { ensureWorkspaceForUser } from "@/lib/workspaces/ensureWorkspaceForUser";

type SearchParams = Promise<Record<string, string | string[] | undefined>> | undefined;

function parseTrialPlan(
  searchParams: Record<string, string | string[] | undefined> | undefined
): PublicSignupTrialPlan | null {
  const raw = searchParams?.plan;
  const planValue = Array.isArray(raw) ? raw[0] : raw;
  return parsePublicSignupTrialPlan(planValue);
}

function parseNextPath(
  searchParams: Record<string, string | string[] | undefined> | undefined
): string | null {
  const raw = searchParams?.next;
  const nextValue = Array.isArray(raw) ? raw[0] : raw;
  return sanitizeNextPath(nextValue);
}

function buildStartRetryHref(options: {
  initialTrialPlan: PublicSignupTrialPlan | null;
  nextPath: string | null;
}): string {
  return buildWorkspaceRecoveryPath({
    initialTrialPlan: options.initialTrialPlan,
    nextPath: options.nextPath,
  });
}

function AccountNotActivatedPanel() {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold text-slate-900">Confirm your email</h1>
      <p className="text-sm text-slate-600">{AUTH_ACCOUNT_NOT_ACTIVATED_MESSAGE}</p>
      <div className="flex w-full flex-col gap-3">
        <Link
          href="/login"
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
        >
          Back to sign in
        </Link>
      </div>
    </main>
  );
}

function WorkspaceSetupFailedPanel({
  retryHref,
}: {
  retryHref: string;
}) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <h1 className="text-xl font-semibold text-slate-900">Workspace setup failed</h1>
      <p className="text-sm text-slate-600">{AUTH_WORKSPACE_SETUP_FAILED_MESSAGE}</p>
      <div className="flex w-full flex-col gap-3">
        <Link
          href={retryHref}
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
  const initialTrialPlan = parseTrialPlan(resolvedSearch);
  const nextPath = parseNextPath(resolvedSearch);
  const retryHref = buildStartRetryHref({ initialTrialPlan, nextPath });

  const supabase = await supabaseServer();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (!user || error) {
    redirect("/login");
  }

  try {
    const workspaceId = await ensureWorkspaceForUser(user.id, { initialTrialPlan });
    redirect(`/${workspaceId}/dashboard`);
  } catch (bootstrapError) {
    const message =
      bootstrapError instanceof Error ? bootstrapError.message : "Unknown workspace setup error";

    if (message === AUTH_ACCOUNT_NOT_ACTIVATED_MESSAGE) {
      return <AccountNotActivatedPanel />;
    }

    if (process.env.NODE_ENV === "development") {
      console.error("[start/workspace-bootstrap]", { userId: user.id, error: message });
    }

    return <WorkspaceSetupFailedPanel retryHref={retryHref} />;
  }
}
