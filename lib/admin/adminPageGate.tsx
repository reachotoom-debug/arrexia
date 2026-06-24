import type { ReactNode } from "react";
import {
  getAdminAccess,
  type AuthorizedAdminAccess,
} from "@/lib/admin/requireAdmin";
import { AdminPageShell } from "@/app/admin/_components/AdminPageShell";
import { AdminSetupRequired } from "@/app/admin/_components/AdminSetupRequired";

export async function guardFullAdminConsoleAccess(): Promise<
  | { ok: true; access: AuthorizedAdminAccess }
  | { ok: false; access: AuthorizedAdminAccess | null; setup?: boolean }
> {
  const access = await getAdminAccess();
  if (!access.authorized) {
    return { ok: false, access: null };
  }
  if (!access.canAccessFullAdmin) {
    return { ok: false, access, setup: true };
  }
  return { ok: true, access };
}

export function renderAdminSetupScreen(access: AuthorizedAdminAccess): ReactNode {
  return (
    <AdminPageShell
      access={access}
      title="Admin setup required"
      description="Install founder admin tables before using the console."
      setupOnly
    >
      <AdminSetupRequired access={access} />
    </AdminPageShell>
  );
}
