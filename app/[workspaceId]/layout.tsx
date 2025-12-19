import { requireWorkspace } from "@/lib/auth/server";

export default async function WorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  await requireWorkspace(workspaceId);

  return <>{children}</>;
}
