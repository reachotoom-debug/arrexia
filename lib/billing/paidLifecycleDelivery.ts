import "server-only";

import { buildAppUrl } from "@/lib/config/appUrl";
import { getEmailIdentity } from "@/lib/email/identities";
import { renderPaidSubscriptionActivatedEmail } from "@/lib/email/templates";
import { sendEmailWithRetry, validateSandboxRecipient } from "@/lib/email/sendEmail";
import { getWorkspaceOwnerEmail } from "@/lib/billing/getWorkspaceOwnerEmail";
import {
  formatBillingIntervalLabel,
  formatPaidSubscriptionActivationPrice,
  getBillingUiPlanLimits,
  getPlanDefinition,
  type BillingInterval,
  type WorkspacePlan,
} from "@/lib/billing/plans";
import {
  acquirePaidLifecycleSendSlot,
  markPaidLifecycleEventFailed,
  markPaidLifecycleEventSent,
  markPaidLifecycleEventSkipped,
  PAID_LIFECYCLE_EVENT_KEYS,
} from "@/lib/billing/paidLifecycleEvents";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type PaidSubscriptionActivatedDeliveryInput = {
  workspaceId: string;
  providerSubscriptionId: string;
  plan: WorkspacePlan;
  billingInterval: BillingInterval;
  periodEndsAt: string | null;
};

export type PaidLifecycleDeliveryResult =
  | { ok: true; sent: true; messageId?: string; recipientEmail: string }
  | { ok: true; sent: false; reason: string }
  | { ok: false; error: string };

type DeliveryDeps = {
  admin?: ReturnType<typeof supabaseAdmin>;
  sendEmailFn?: typeof sendEmailWithRetry;
  resolveOwnerFn?: typeof getWorkspaceOwnerEmail;
};

const PAID_SUBSCRIPTION_ACTIVATED_KEY = PAID_LIFECYCLE_EVENT_KEYS[0];

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

export async function deliverPaidSubscriptionActivatedEmail(
  input: PaidSubscriptionActivatedDeliveryInput,
  deps: DeliveryDeps = {},
  now: Date = new Date()
): Promise<PaidLifecycleDeliveryResult> {
  const { workspaceId, providerSubscriptionId, plan, billingInterval, periodEndsAt } = input;

  if (plan === "free") {
    return { ok: true, sent: false, reason: "free_plan" };
  }

  const admin = deps.admin ?? supabaseAdmin();
  const sendEmailFn = deps.sendEmailFn ?? sendEmailWithRetry;
  const resolveOwnerFn = deps.resolveOwnerFn ?? getWorkspaceOwnerEmail;

  const reservation = await acquirePaidLifecycleSendSlot(
    workspaceId,
    providerSubscriptionId,
    PAID_SUBSCRIPTION_ACTIVATED_KEY,
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
      await markPaidLifecycleEventSkipped(
        workspaceId,
        providerSubscriptionId,
        PAID_SUBSCRIPTION_ACTIVATED_KEY,
        ownerLookup.reason,
        admin,
        now
      );
      return { ok: true, sent: false, reason: ownerLookup.reason };
    }

    await markPaidLifecycleEventFailed(
      providerSubscriptionId,
      PAID_SUBSCRIPTION_ACTIVATED_KEY,
      ownerLookup.reason,
      reservation.attemptCount,
      admin,
      now
    );
    return { ok: true, sent: false, reason: ownerLookup.reason };
  }

  const sandboxError = validateSandboxRecipient(ownerLookup.owner.email);
  if (sandboxError) {
    await markPaidLifecycleEventFailed(
      providerSubscriptionId,
      PAID_SUBSCRIPTION_ACTIVATED_KEY,
      sandboxError,
      reservation.attemptCount,
      admin,
      now
    );
    return { ok: false, error: sandboxError };
  }

  const workspaceName = await loadWorkspaceName(workspaceId, admin);
  const planDefinition = getPlanDefinition(plan);
  const rendered = renderPaidSubscriptionActivatedEmail({
    workspaceName,
    workspaceUrl: buildAppUrl(`/${workspaceId}`),
    ownerDisplayName: ownerLookup.owner.displayName,
    planName: planDefinition.name,
    billingIntervalLabel: formatBillingIntervalLabel(billingInterval),
    priceLabel: formatPaidSubscriptionActivationPrice(plan, billingInterval),
    renewalDate: periodEndsAt,
    planLimits: getBillingUiPlanLimits(plan),
  });

  const sendResult = await sendEmailFn({
    to: ownerLookup.owner.email,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    replyTo: getEmailIdentity("billing").replyTo,
  });

  if (!sendResult.success) {
    const errorMessage = sendResult.error ?? "Failed to send paid lifecycle email";
    await markPaidLifecycleEventFailed(
      providerSubscriptionId,
      PAID_SUBSCRIPTION_ACTIVATED_KEY,
      errorMessage,
      reservation.attemptCount,
      admin,
      now
    );
    return { ok: false, error: errorMessage };
  }

  await markPaidLifecycleEventSent(
    providerSubscriptionId,
    PAID_SUBSCRIPTION_ACTIVATED_KEY,
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
