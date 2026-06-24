import { getAdminAccess } from "@/lib/admin/requireAdmin";
import { AdminUnauthorized } from "./_components/AdminUnauthorized";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const access = await getAdminAccess();

  if (!access.authorized) {
    return <AdminUnauthorized />;
  }

  return children;
}
