"use server";

import { logPortalFailure } from "@/lib/billing/paddle/portalDiagnostics";
import { requireWorkspace } from "@/lib/auth/server";
import { createPaddleCustomerPortalSessionForWorkspace } from "@/lib/billing/paddle/createPaddleCustomerPortalSession";

export type OpenPaddleCustomerPortalResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/** Opens Paddle's hosted customer portal for the workspace's persisted Paddle customer. */
export async function openPaddleCustomerPortal(
  workspaceId: string
): Promise<OpenPaddleCustomerPortalResult> {
  try {
    await requireWorkspace(workspaceId);

    const result = await createPaddleCustomerPortalSessionForWorkspace(workspaceId);
    if (!result.ok) {
      return { ok: false, error: result.message };
    }

    return { ok: true, url: result.url };
  } catch (error) {
    logPortalFailure("workspace_access", error);
    return { ok: false, error: "Unable to open subscription management." };
  }
}
