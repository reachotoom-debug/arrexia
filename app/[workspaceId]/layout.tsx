import { requireWorkspace } from "@/lib/auth/server";
import { userCanAccessAdminPanel } from "@/lib/admin/requireAdmin";
import { getAdminBasePath } from "@/lib/admin/adminPaths";
import { getCurrentProfile } from "@/lib/profile/server";
import { getWorkspacePlan } from "@/lib/billing/getWorkspacePlan";
import { createRoutePerf } from "@/lib/perf/server";
import { WorkspaceShell } from "./_components/WorkspaceShell";

type Params = Promise<{ workspaceId: string }>;

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Params;
}) {
  const perf = createRoutePerf("workspace-layout");
  const { workspaceId } = await params;
  const { workspace, user } = await perf.time("requireWorkspace", () =>
    requireWorkspace(workspaceId)
  );

  const [profileResult, planResult, showAdminLink] = await Promise.all([
    perf.time("getCurrentProfile", () => getCurrentProfile()),
    perf.time("getWorkspacePlan", () => getWorkspacePlan(workspaceId)),
    perf.time("adminAccessCheck", () =>
      userCanAccessAdminPanel(user.id, user.email)
    ),
  ]);

  const profile = profileResult.profile;
  const plan = planResult.plan;

  perf.finish({ showAdminLink: showAdminLink ? 1 : 0 });

  return (
    <WorkspaceShell
      workspaceId={workspaceId}
      workspaceName={workspace.name}
      userEmail={user.email ?? ""}
      userFullName={profile?.full_name ?? null}
      userAvatarUrl={profile?.avatar_url ?? null}
      plan={plan}
      showAdminLink={showAdminLink}
      adminPath={getAdminBasePath()}
    >
      {children}
    </WorkspaceShell>
  );
}
