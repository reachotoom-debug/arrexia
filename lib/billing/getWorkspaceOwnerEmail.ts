import "server-only";

import { supabaseAdmin } from "@/lib/supabase/admin";

export type WorkspaceOwnerContact = {
  userId: string;
  email: string;
};

export type WorkspaceOwnerLookupResult =
  | { ok: true; owner: WorkspaceOwnerContact }
  | { ok: false; reason: "no_owner" | "no_email" | "lookup_failed" };

type OwnerMemberRow = {
  workspace_id: string;
  user_id: string;
  role: string;
  created_at: string | null;
};

/** Earliest owner membership wins when multiple owners exist. */
export function pickEarliestOwnerMember(
  members: OwnerMemberRow[]
): OwnerMemberRow | null {
  const owners = members.filter((member) => member.role === "owner");
  if (owners.length === 0) {
    return null;
  }

  return owners.sort((a, b) => {
    const aCreated = a.created_at ? Date.parse(a.created_at) : Number.POSITIVE_INFINITY;
    const bCreated = b.created_at ? Date.parse(b.created_at) : Number.POSITIVE_INFINITY;
    if (aCreated !== bCreated) {
      return aCreated - bCreated;
    }
    return a.user_id.localeCompare(b.user_id);
  })[0]!;
}

export async function getWorkspaceOwnerEmail(
  workspaceId: string
): Promise<WorkspaceOwnerLookupResult> {
  const admin = supabaseAdmin();

  const { data: members, error: membersError } = await admin
    .from("workspace_members")
    .select("workspace_id, user_id, role, created_at")
    .eq("workspace_id", workspaceId)
    .eq("role", "owner");

  if (membersError) {
    console.error(
      `[trial-lifecycle] owner lookup failed for ${workspaceId}:`,
      membersError.message
    );
    return { ok: false, reason: "lookup_failed" };
  }

  const owner = pickEarliestOwnerMember((members ?? []) as OwnerMemberRow[]);
  if (!owner) {
    return { ok: false, reason: "no_owner" };
  }

  const { data: userData, error: userError } = await admin.auth.admin.getUserById(
    owner.user_id
  );

  if (userError) {
    console.error(
      `[trial-lifecycle] auth user lookup failed for ${owner.user_id}:`,
      userError.message
    );
    return { ok: false, reason: "lookup_failed" };
  }

  const email = userData.user?.email?.trim();
  if (!email) {
    return { ok: false, reason: "no_email" };
  }

  return {
    ok: true,
    owner: {
      userId: owner.user_id,
      email,
    },
  };
}

export async function getWorkspaceOwnerEmailsByWorkspaceId(
  workspaceIds: string[]
): Promise<Map<string, WorkspaceOwnerContact>> {
  const uniqueIds = [...new Set(workspaceIds)];
  const results = new Map<string, WorkspaceOwnerContact>();

  if (uniqueIds.length === 0) {
    return results;
  }

  const admin = supabaseAdmin();
  const { data: members, error } = await admin
    .from("workspace_members")
    .select("workspace_id, user_id, role, created_at")
    .in("workspace_id", uniqueIds)
    .eq("role", "owner");

  if (error) {
    console.error("[trial-lifecycle] batch owner lookup failed:", error.message);
    return results;
  }

  const ownersByWorkspace = new Map<string, OwnerMemberRow[]>();
  for (const row of (members ?? []) as OwnerMemberRow[]) {
    const list = ownersByWorkspace.get(row.workspace_id) ?? [];
    list.push(row);
    ownersByWorkspace.set(row.workspace_id, list);
  }

  for (const workspaceId of uniqueIds) {
    const owner = pickEarliestOwnerMember(ownersByWorkspace.get(workspaceId) ?? []);
    if (!owner) {
      continue;
    }

    const { data: userData, error: userError } = await admin.auth.admin.getUserById(
      owner.user_id
    );
    if (userError) {
      console.error(
        `[trial-lifecycle] auth user lookup failed for ${owner.user_id}:`,
        userError.message
      );
      continue;
    }

    const email = userData.user?.email?.trim();
    if (!email) {
      continue;
    }

    results.set(workspaceId, { userId: owner.user_id, email });
  }

  return results;
}
