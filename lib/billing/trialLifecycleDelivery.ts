import "server-only";

import { buildAppUrl } from "@/lib/config/appUrl";
import { getEmailIdentity } from "@/lib/email/identities";
import { renderTrialLifecycleEmail } from "@/lib/email/templates";
import { sendEmailWithRetry, validateSandboxRecipient } from "@/lib/email/sendEmail";
import { getWorkspaceEntitlementState } from "@/lib/billing/getWorkspaceEntitlement";
import { getWorkspaceOwnerEmail } from "@/lib/billing/getWorkspaceOwnerEmail";
import {
  acquireTrialLifecycleSendSlot,
  markTrialLifecycleEventFailed,
  markTrialLifecycleEventSent,
  markTrialLifecycleEventSkipped,
  type TrialLifecycleEventKey,
} from "@/lib/billing/trialLifecycleEvents";
import {
  getEligibleTrialLifecycleEvents,
  isTrialStartedEligible,
} from "@/lib/billing/trialLifecycleEligibility";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type TrialLifecycleDeliveryResult =
  | { ok: true; sent: true; messageId?: string; recipientEmail: string }
  | { ok: true; sent: false; reason: string }
  | { ok: false; error: string };

type DeliveryDeps = {
  admin?: ReturnType<typeof supabaseAdmin>;
  sendEmailFn?: typeof sendEmailWithRetry;
  loadEntitlementFn?: typeof getWorkspaceEntitlementState;
  resolveOwnerFn?: typeof getWorkspaceOwnerEmail;
};

async function loadWorkspaceName(
  workspaceId: string,
  admin: ReturnType<typeof supabaseAdmin>
): Promise<string> {
  const { data } = await admin
    .from("workspaces")
    .select("name")
    .eq("id", workspaceId)
    .maybeSingle();

  const name = data?.name?.trim();
  return name || "your workspace";
}

function buildTrialLifecycleUrls(workspaceId: string) {
  const workspaceUrl = buildAppUrl(`/${workspaceId}`);
  const billingUrl = buildAppUrl(`/${workspaceId}/settings?section=billing`);
  return { workspaceUrl, billingUrl };
}

export async function deliverTrialLifecycleEmail(
  workspaceId: string,
  eventKey: TrialLifecycleEventKey,
  deps: DeliveryDeps = {},
  now: Date = new Date()
): Promise<TrialLifecycleDeliveryResult> {
  const admin = deps.admin ?? supabaseAdmin();
  const sendEmailFn = deps.sendEmailFn ?? sendEmailWithRetry;
  const loadEntitlementFn = deps.loadEntitlementFn ?? getWorkspaceEntitlementState;
  const resolveOwnerFn = deps.resolveOwnerFn ?? getWorkspaceOwnerEmail;

  const entitlement = await loadEntitlementFn(workspaceId, now);

  if (entitlement.state === "paid") {
    return { ok: true, sent: false, reason: "paid_workspace" };
  }

  const { data: subscription } = await admin
    .from("workspace_subscriptions")
    .select("trial_ends_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  const trialEndsAt = (subscription?.trial_ends_at as string | null | undefined) ?? null;
  const eligibleEvents = getEligibleTrialLifecycleEvents(entitlement, trialEndsAt, now);

  if (eventKey === "trial_started") {
    if (!isTrialStartedEligible(entitlement.state, trialEndsAt, now)) {
      return { ok: true, sent: false, reason: "not_eligible" };
    }
  } else if (!eligibleEvents.includes(eventKey)) {
    return { ok: true, sent: false, reason: "not_eligible" };
  }

  const reservation = await acquireTrialLifecycleSendSlot(
    workspaceId,
    eventKey,
    admin,
    now
  );

  if (!reservation.acquired) {
    if (reservation.reason === "already_sent") {
      return { ok: true, sent: false, reason: "already_sent" };
    }
    if (reservation.reason === "in_progress") {
      return { ok: true, sent: false, reason: "in_progress" };
    }
    if (reservation.reason === "missing_table") {
      return { ok: true, sent: false, reason: "missing_table" };
    }
    return { ok: true, sent: false, reason: reservation.reason };
  }

  const ownerLookup = await resolveOwnerFn(workspaceId);
  if (!ownerLookup.ok) {
    if (ownerLookup.reason === "no_email") {
      await markTrialLifecycleEventSkipped(
        workspaceId,
        eventKey,
        ownerLookup.reason,
        admin,
        now
      );
      return { ok: true, sent: false, reason: ownerLookup.reason };
    }

    await markTrialLifecycleEventFailed(
      workspaceId,
      eventKey,
      ownerLookup.reason,
      reservation.attemptCount,
      admin,
      now
    );
    return { ok: true, sent: false, reason: ownerLookup.reason };
  }

  const sandboxError = validateSandboxRecipient(ownerLookup.owner.email);
  if (sandboxError) {
    await markTrialLifecycleEventFailed(
      workspaceId,
      eventKey,
      sandboxError,
      reservation.attemptCount,
      admin,
      now
    );
    return { ok: false, error: sandboxError };
  }

  const workspaceName = await loadWorkspaceName(workspaceId, admin);
  const { workspaceUrl, billingUrl } = buildTrialLifecycleUrls(workspaceId);
  const rendered = renderTrialLifecycleEmail(eventKey, {
    workspaceName,
    trialEndsAt,
    workspaceUrl,
    billingUrl,
    ownerDisplayName: ownerLookup.owner.displayName,
  });

  const sendResult = await sendEmailFn({
    to: ownerLookup.owner.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    replyTo: getEmailIdentity("billing").replyTo,
  });

  if (!sendResult.success) {
    const errorMessage = sendResult.error ?? "Failed to send lifecycle email";
    await markTrialLifecycleEventFailed(
      workspaceId,
      eventKey,
      errorMessage,
      reservation.attemptCount,
      admin,
      now
    );
    return { ok: false, error: errorMessage };
  }

  await markTrialLifecycleEventSent(
    workspaceId,
    eventKey,
    {
      messageId: sendResult.messageId,
      recipientEmail: ownerLookup.owner.email,
      attemptCount: reservation.attemptCount,
    },
    admin,
    now
  );

  return {
    ok: true,
    sent: true,
    messageId: sendResult.messageId,
    recipientEmail: ownerLookup.owner.email,
  };
}
