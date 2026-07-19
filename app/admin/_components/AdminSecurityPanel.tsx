"use client";

import { useRouter } from "next/navigation";
import { useTransition, useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import {
  addAdminUserAction,
  bootstrapSuperAdminAction,
  removeAdminUserAction,
  updateAdminRoleAction,
} from "../actions";
import type { AdminRole } from "@/lib/admin/requireAdmin";
import { AdminDateTimeCell } from "@/components/admin/AdminDateTimeCell";
import { AdminCard } from "./adminUtils";
import { Button } from "@/components/ui/button";

type AdminUserRow = {
  id: string;
  userId: string;
  email: string | null;
  role: AdminRole;
  createdAt: string;
  createdByEmail: string | null;
};

type AdminSecurityPanelProps = {
  adminUsers: AdminUserRow[];
  bootstrapAllowed: boolean;
  tablesMissing: boolean;
  isSuperAdmin: boolean;
  currentUserId: string;
  auditLogs: Array<{
    id: string;
    action: string;
    targetType: string | null;
    targetId: string | null;
    createdAt: string;
  }>;
};

const ROLES: AdminRole[] = ["super_admin", "admin", "support", "analyst"];

export function AdminSecurityPanel({
  adminUsers,
  bootstrapAllowed,
  tablesMissing,
  isSuperAdmin,
  currentUserId,
  auditLogs,
}: AdminSecurityPanelProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();
  const [newEmail, setNewEmail] = useState("");
  const [newRole, setNewRole] = useState<AdminRole>("admin");

  const handleBootstrap = () => {
    startTransition(async () => {
      const result = await bootstrapSuperAdminAction();
      if (result.ok) {
        toast({ title: "Super admin created", description: "You can now manage admin users." });
        router.refresh();
      } else {
        toast({
          variant: "destructive",
          title: "Bootstrap failed",
          description: result.error,
        });
      }
    });
  };

  const handleAddAdmin = () => {
    startTransition(async () => {
      const result = await addAdminUserAction({ email: newEmail, role: newRole });
      if (result.ok) {
        toast({ title: "Admin added", description: newEmail });
        setNewEmail("");
        router.refresh();
      } else {
        toast({
          variant: "destructive",
          title: "Could not add admin",
          description: result.error,
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      {bootstrapAllowed && !tablesMissing ? (
        <AdminCard className="border-amber-200 bg-amber-50 p-6">
          <h2 className="text-lg font-semibold text-amber-950">First-time setup</h2>
          <p className="mt-2 text-sm text-amber-900">
            No admin users exist yet. Bootstrap your account as super admin using your
            emergency allowlist email.
          </p>
          <Button className="mt-4" onClick={handleBootstrap} disabled={isPending}>
            Become super admin
          </Button>
        </AdminCard>
      ) : null}

      {bootstrapAllowed && tablesMissing ? (
        <AdminCard className="border-red-200 bg-red-50 p-6">
          <h2 className="text-lg font-semibold text-red-950">Bootstrap unavailable</h2>
          <p className="mt-2 text-sm text-red-900">
            Admin tables are not installed. Run the founder admin migration first.
          </p>
        </AdminCard>
      ) : null}

      <AdminCard className="overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">Admin users</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Email</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Role</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Created</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Created by</th>
                {isSuperAdmin ? (
                  <th className="px-4 py-3 text-left font-medium text-slate-600">Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {adminUsers.map((row) => (
                <tr key={row.id}>
                  <td className="px-4 py-3 text-slate-900">{row.email ?? row.userId}</td>
                  <td className="px-4 py-3">
                    {isSuperAdmin ? (
                      <select
                        className="rounded border border-slate-300 px-2 py-1 text-sm"
                        value={row.role}
                        disabled={isPending}
                        onChange={(e) => {
                          const role = e.target.value as AdminRole;
                          startTransition(async () => {
                            const result = await updateAdminRoleAction({
                              adminUserRowId: row.id,
                              role,
                            });
                            if (result.ok) router.refresh();
                            else
                              toast({
                                variant: "destructive",
                                title: "Role update failed",
                                description: result.error,
                              });
                          });
                        }}
                      >
                        {ROLES.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    ) : (
                      row.role
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    <AdminDateTimeCell value={row.createdAt} />
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {row.createdByEmail ?? "—"}
                  </td>
                  {isSuperAdmin ? (
                    <td className="px-4 py-3">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={isPending || row.userId === currentUserId}
                        onClick={() => {
                          startTransition(async () => {
                            const result = await removeAdminUserAction(row.id);
                            if (result.ok) router.refresh();
                            else
                              toast({
                                variant: "destructive",
                                title: "Remove failed",
                                description: result.error,
                              });
                          });
                        }}
                      >
                        Remove
                      </Button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminCard>

      {isSuperAdmin ? (
        <AdminCard className="p-4">
          <h3 className="text-sm font-semibold text-slate-900">Add admin by email</h3>
          <div className="mt-3 flex flex-col gap-3 sm:flex-row">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="user@example.com"
              className="flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <select
              value={newRole}
              onChange={(e) => setNewRole(e.target.value as AdminRole)}
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {ROLES.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
            <Button onClick={handleAddAdmin} disabled={isPending || !newEmail.trim()}>
              Add admin
            </Button>
          </div>
        </AdminCard>
      ) : null}

      <AdminCard className="overflow-hidden">
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-base font-semibold text-slate-900">Admin audit log</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-slate-600">When</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Action</th>
                <th className="px-4 py-3 text-left font-medium text-slate-600">Target</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 bg-white">
              {auditLogs.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-slate-500">
                    No admin audit events yet.
                  </td>
                </tr>
              ) : (
                auditLogs.map((log) => (
                  <tr key={log.id}>
                    <td className="px-4 py-3 text-slate-600">
                      <AdminDateTimeCell value={log.createdAt} />
                    </td>
                    <td className="px-4 py-3 text-slate-900">{log.action}</td>
                    <td className="px-4 py-3 text-slate-600">
                      {log.targetType ?? "—"} {log.targetId ? `· ${log.targetId.slice(0, 8)}…` : ""}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </AdminCard>
    </div>
  );
}
