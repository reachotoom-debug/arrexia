import { requireUser, requireWorkspace } from "@/lib/auth/server";
import { AppSidebar } from "@/components/layout/AppSidebar";

interface WorkspaceLayoutProps {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}

function getInitials(
  fullName: string | null,
  workspaceName: string,
  email: string | null
): string {
  // Prefer user full name, then workspace name, then email
  if (fullName && fullName.trim().length > 0) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0]!.slice(0, 2).toUpperCase();
    }
    return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase();
  }
  if (workspaceName && workspaceName.trim().length > 0) {
    const parts = workspaceName.trim().split(/\s+/);
    if (parts.length === 1) {
      return parts[0]!.slice(0, 2).toUpperCase();
    }
    return (parts[0]![0] + parts[parts.length - 1]![0]).toUpperCase();
  }
  if (email) {
    return email.slice(0, 2).toUpperCase();
  }
  return "FC";
}

export default async function WorkspaceLayout({
  children,
  params,
}: WorkspaceLayoutProps) {
  // ✅ Unwrap the params Promise (Next.js 16 async params API)
  const { workspaceId } = await params;

  // ✅ Enforce access and get workspace + user info
  const { workspace } = await requireWorkspace(workspaceId);
  const { user } = await requireUser();

  const workspaceName = workspace?.name ?? "Workspace";
  const userEmail = user?.email ?? "";
  const userInitials = getInitials(user.fullName, workspaceName, user.email);

  return (
    <div className="flex h-screen overflow-hidden">
      <AppSidebar
        workspaceId={workspace.id}
        workspaceName={workspaceName}
        userEmail={userEmail}
        userInitials={userInitials}
        planLabel="Free"
        profile={
          user.fullName || user.avatarUrl
            ? {
                full_name: user.fullName,
                avatar_url: user.avatarUrl,
              }
            : null
        }
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <main className="flex-1 overflow-y-auto bg-slate-50">
          <div className="p-6">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
