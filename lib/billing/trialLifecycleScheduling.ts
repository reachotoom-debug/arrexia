/**
 * Non-server-only scheduling hook for trial lifecycle emails.
 * Safe to import from modules exercised in node:test without server-only shims.
 */

export async function scheduleTrialLifecycleEvents(workspaceId: string): Promise<void> {
  try {
    const { deliverTrialLifecycleEmail } = await import("@/lib/billing/trialLifecycleDelivery");
    await deliverTrialLifecycleEmail(workspaceId, "trial_started");
  } catch (error) {
    console.error(
      `[trial-lifecycle] trial_started delivery failed for ${workspaceId}:`,
      error instanceof Error ? error.message : error
    );
  }
}

/** Fire-and-forget wrapper used after trial creation. */
export function enqueueTrialStartedEmail(workspaceId: string): void {
  void scheduleTrialLifecycleEvents(workspaceId);
}
