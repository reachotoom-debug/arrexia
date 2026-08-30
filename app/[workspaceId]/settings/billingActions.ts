"use server";

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
    console.error(
      `[paddle/portal] open action failed for ${workspaceId}:`,
      error instanceof Error ? error.message : error
    );
    return { ok: false, error: "Unable to open subscription management." };
  }
}
