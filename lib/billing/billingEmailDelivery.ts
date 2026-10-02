import "server-only";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { buildAppUrl } from "@/lib/config/appUrl";
import { getEmailIdentity } from "@/lib/email/identities";
import { sendEmail, validateSandboxRecipient, type SendEmailInput } from "@/lib/email/sendEmail";
import { renderPaidSubscriptionActivatedEmail, renderPaidSubscriptionRenewedEmail, renderAnnualRenewalReminderEmail } from "@/lib/email/templates";
import { getWorkspaceOwnerEmail } from "./getWorkspaceOwnerEmail";
import { getBillingUiPlanLimits, getPlanDefinition, isWorkspacePlan, formatBillingIntervalLabel, formatPaidSubscriptionActivationPrice } from "./plans";
import { getPaddleEnvironment } from "./paddle/env.server";

export type BillingEmailNotification = {
  id: string; workspace_id: string; claim_token: string; notification_kind: "activation" | "renewal" | "annual_reminder";
  paddle_environment: string; resend_idempotency_key: string; request_payload: SendEmailInput | null;
  period_starts_at: string | null; period_ends_at: string | null;
  payload: { plan?: string; billing_interval?: string; transaction_totals?: { total?: string; currency_code?: string } };
};
type DeliveryDeps = {
  admin?: ReturnType<typeof supabaseAdmin>;
  sendEmailFn?: typeof sendEmail;
  buildRequestFn?: (row: BillingEmailNotification, admin: ReturnType<typeof supabaseAdmin>) => Promise<SendEmailInput>;
};
export type BillingEmailOutcome = "sent" | "failed" | "uncertain" | "unavailable";

/** Verified transaction totals are minor units; never substitute advertised prices. */
export function formatVerifiedPaymentTotal(totals?: { total?: string; currency_code?: string }): string | null {
  if (!totals?.total || !/^\d+$/.test(totals.total) || !totals.currency_code || !/^[A-Z]{3}$/.test(totals.currency_code)) return null;
  const value = Number(totals.total);
  if (!Number.isSafeInteger(value)) return null;
  try {
    const formatter = new Intl.NumberFormat("en-US", { style: "currency", currency: totals.currency_code });
    const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
    return formatter.format(value / 10 ** digits);
  } catch { return null; }
}

async function buildNotificationRequest(row: BillingEmailNotification, admin: ReturnType<typeof supabaseAdmin>): Promise<SendEmailInput> {
  const owner = await getWorkspaceOwnerEmail(row.workspace_id);
  if (!owner.ok) throw new Error("billing_email_owner_unavailable");
  if (validateSandboxRecipient(owner.owner.email)) throw new Error("billing_email_sender_not_live");
  const { data, error } = await admin.from("workspaces").select("name").eq("id", row.workspace_id).maybeSingle();
  if (error) throw new Error("billing_email_workspace_unavailable");
  const plan = row.payload.plan;
  if (!plan || !isWorkspacePlan(plan) || plan === "free") throw new Error("billing_email_plan_invalid");
  const interval = row.payload.billing_interval;
  if (interval !== "monthly" && interval !== "annual") throw new Error("billing_email_interval_invalid");
  const context = { workspaceName: data?.name || "your workspace", workspaceUrl: buildAppUrl(`/${row.workspace_id}`),
    ownerDisplayName: owner.owner.displayName, planName: getPlanDefinition(plan).name };
  let rendered;
  if (row.notification_kind === "activation") {
    rendered = renderPaidSubscriptionActivatedEmail({ ...context, billingIntervalLabel: formatBillingIntervalLabel(interval),
      priceLabel: formatPaidSubscriptionActivationPrice(plan, interval), renewalDate: row.period_ends_at, planLimits: getBillingUiPlanLimits(plan) });
  } else if (row.notification_kind === "renewal") {
    rendered = renderPaidSubscriptionRenewedEmail({ ...context, billingIntervalLabel: formatBillingIntervalLabel(interval),
      periodStartsAt: row.period_starts_at, periodEndsAt: row.period_ends_at, paidAmountLabel: formatVerifiedPaymentTotal(row.payload.transaction_totals) });
  } else if (row.notification_kind === "annual_reminder" && row.period_ends_at) {
    rendered = renderAnnualRenewalReminderEmail({ ...context, billingUrl: buildAppUrl(`/${row.workspace_id}/settings?section=billing`), renewalDate: row.period_ends_at });
  } else throw new Error("billing_email_kind_invalid");
  const identity = getEmailIdentity("billing");
  return { to: owner.owner.email, subject: rendered.subject, html: rendered.html, text: rendered.text, replyTo: identity.replyTo, frozenFrom: identity.from };
}

/** Billing already committed. Only this leased notification is touched by delivery. */
export async function deliverBillingEmailNotification(id: string, deps: DeliveryDeps = {}): Promise<{ outcome: BillingEmailOutcome }> {
  if (getPaddleEnvironment() !== "production") return { outcome: "unavailable" };
  const admin = deps.admin ?? supabaseAdmin();
  const claimed = await admin.rpc("rpc_claim_paid_billing_email", { p_notification_id: id });
  const row = claimed.data?.notification as BillingEmailNotification | undefined;
  if (claimed.error || claimed.data?.state !== "claimed" || !row?.claim_token || row.paddle_environment !== "production" || !row.resend_idempotency_key) return { outcome: "unavailable" };
  const finish = async (outcome: string, messageId: string | null = null) => {
    const result = await admin.rpc("rpc_finish_paid_billing_email", { p_notification_id: id, p_claim_token: row.claim_token,
      p_outcome: outcome, p_message_id: messageId, p_error: outcome === "sent" ? null : `billing_email_${outcome}` });
    return !result.error && result.data === true;
  };
  let proposed;
  try { proposed = row.request_payload ?? await (deps.buildRequestFn ?? buildNotificationRequest)(row, admin); }
  catch { await finish("failed").catch(() => false); return { outcome: "failed" }; }
  let prepared;
  try { prepared = await admin.rpc("rpc_prepare_paid_billing_email", { p_notification_id: id, p_claim_token: row.claim_token, p_request: proposed }); }
  catch { return { outcome: "unavailable" }; }
  if (prepared.error || !prepared.data?.to || !prepared.data?.subject || !prepared.data?.frozenFrom) return { outcome: "unavailable" };
  let sent;
  try { sent = await (deps.sendEmailFn ?? sendEmail)({ ...prepared.data, idempotencyKey: row.resend_idempotency_key }); }
  catch { sent = { success: false, uncertain: true }; }
  const outcome: BillingEmailOutcome = sent.success && sent.messageId ? "sent" : sent.success || sent.uncertain ? "uncertain" : "failed";
  // Failure to persist provider acceptance stays ambiguous; never blindly repeat later.
  const recorded = await finish(outcome, sent.messageId ?? null).catch(() => false);
  return { outcome: recorded ? outcome : "uncertain" };
}

/** Daily recovery is bounded. Unknown outcomes beyond the provider window need review. */
export async function runPaidBillingEmailRecovery(limit = 25, deps: DeliveryDeps = {}) {
  if (getPaddleEnvironment() !== "production") return { attempted: 0, sent: 0, uncertain: 0, failed: 0 };
  const admin = deps.admin ?? supabaseAdmin();
  const bound = Math.max(1, Math.min(25, Math.trunc(limit) || 25));
  const { data, error } = await admin.from("workspace_paid_lifecycle_events").select("id")
    .eq("paddle_environment", "production").in("delivery_status", ["pending", "failed", "sending", "uncertain"])
    .not("available_at", "is", null).lte("available_at", new Date().toISOString()).order("available_at").limit(bound);
  if (error) throw new Error("billing_email_recovery_query_failed");
  const summary = { attempted: 0, sent: 0, uncertain: 0, failed: 0 };
  const started = Date.now();
  for (const row of data ?? []) {
    if (Date.now() - started > 20_000) break;
    try {
      const result = await deliverBillingEmailNotification(row.id, { ...deps, admin });
      if (result.outcome !== "unavailable") { summary.attempted++; summary[result.outcome]++; }
    } catch { summary.failed++; }
  }
  return summary;
}

export async function enqueueAnnualBillingReminders(limit = 25, admin = supabaseAdmin()) {
  if (getPaddleEnvironment() !== "production") return 0;
  const result = await admin.rpc("rpc_enqueue_annual_billing_reminders", { p_limit: Math.max(1, Math.min(25, Math.trunc(limit) || 25)) });
  if (result.error) throw new Error("billing_email_reminder_enqueue_failed");
  return typeof result.data === "number" ? result.data : 0;
}
