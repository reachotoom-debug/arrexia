import { requireWorkspace } from "@/lib/auth/server";
import { userCanAccessAdminPanel } from "@/lib/admin/requireAdmin";
import { getAdminBasePath } from "@/lib/admin/adminPaths";
import { getCurrentProfile } from "@/lib/profile/server";
import { getWorkspacePlan } from "@/lib/billing/getWorkspacePlan";
import { WorkspaceShell } from "./_components/WorkspaceShell";

type Params = Promise<{ workspaceId: string }>;

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Params;
}) {
  const { workspaceId } = await params;
  const { workspace, user } = await requireWorkspace(workspaceId);

  const [profileResult, planResult, showAdminLink] = await Promise.all([
    getCurrentProfile(),
    getWorkspacePlan(workspaceId),
    userCanAccessAdminPanel(user.id, user.email),
  ]);

  const profile = profileResult.profile;
  const plan = planResult.plan;

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
