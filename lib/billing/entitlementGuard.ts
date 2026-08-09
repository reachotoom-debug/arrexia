import "server-only";

import { countActiveClientsForPlan } from "./assertWithinPlanLimits";
import {
  EntitlementError,
  TRIAL_AUTOMATED_REMINDER_LIMIT_MESSAGE,
  TRIAL_CLIENT_LIMIT_MESSAGE,
  TRIAL_EXPIRED_MESSAGE,
  TRIAL_INVOICE_LIMIT_MESSAGE,
  TRIAL_MANUAL_EMAIL_REMINDER_LIMIT_MESSAGE,
  TRIAL_AI_LIMIT_MESSAGE,
} from "./entitlementErrors";
import { getWorkspaceEntitlementState } from "./getWorkspaceEntitlement";
import { randomUUID } from "node:crypto";

import {
  finalizeEntitlementUsage,
  getRemainingTrialUsage,
  isTrialUsageExhausted,
  loadEntitlementUsage,
  releaseEntitlementUsage,
  reserveEntitlementUsage,
} from "./usageMetering";
import type { TrialUsageResource } from "./trialConfig";
import { assertClientCreateAllowed, assertInvoiceCreateAllowed } from "./assertWithinPlanLimits";

export type MutationCapability =
  | "workspace_mutation"
  | "client_create"
  | "client_update"
  | "client_delete"
  | "invoice_create"
  | "invoice_update"
  | "invoice_delete"
  | "payment_mutation"
  | "reminder_send_manual"
  | "reminder_automation_execute"
  | "reminder_rules_manage"
  | "reminder_automation_enable"
  | "ai_generate"
  | "whatsapp_collection"
  | "csv_import";

const READ_ONLY_ALLOWED: MutationCapability[] = [];

function trialUsageError(resource: TrialUsageResource): EntitlementError {
  switch (resource) {
    case "trial_invoices":
      return new EntitlementError("TRIAL_INVOICE_LIMIT_REACHED", TRIAL_INVOICE_LIMIT_MESSAGE);
    case "ai_generations":
      return new EntitlementError("TRIAL_AI_LIMIT_REACHED", TRIAL_AI_LIMIT_MESSAGE);
    case "automated_reminders":
      return new EntitlementError(
        "TRIAL_AUTOMATION_LIMIT_REACHED",
        TRIAL_AUTOMATED_REMINDER_LIMIT_MESSAGE
      );
    case "manual_email_reminders":
      return new EntitlementError(
        "TRIAL_MANUAL_EMAIL_LIMIT_REACHED",
        TRIAL_MANUAL_EMAIL_REMINDER_LIMIT_MESSAGE
      );
    default:
      return new EntitlementError("TRIAL_EXPIRED", TRIAL_EXPIRED_MESSAGE);
  }
}

export async function assertWorkspaceMutationAllowed(
  workspaceId: string,
  capability: MutationCapability
): Promise<void> {
  const entitlement = await getWorkspaceEntitlementState(workspaceId);

  if (entitlement.state === "trial_expired") {
    throw new EntitlementError("TRIAL_EXPIRED", TRIAL_EXPIRED_MESSAGE);
  }

  if (!entitlement.canMutate) {
    throw new EntitlementError("TRIAL_EXPIRED", TRIAL_EXPIRED_MESSAGE);
  }

  if (capability === "reminder_rules_manage" || capability === "reminder_automation_enable") {
    if (entitlement.state !== "trial" && entitlement.state !== "paid") {
      throw new EntitlementError("PAID_PLAN_REQUIRED", TRIAL_EXPIRED_MESSAGE);
    }
  }

  void READ_ONLY_ALLOWED;
}

export async function assertClientCreateEntitlement(workspaceId: string): Promise<void> {
  await assertWorkspaceMutationAllowed(workspaceId, "client_create");
  const entitlement = await getWorkspaceEntitlementState(workspaceId);

  if (entitlement.state === "trial") {
    const usage = await loadEntitlementUsage(workspaceId);
    void usage;
    const activeCount = await countActiveClientsForPlan(workspaceId);
    if (entitlement.clientLimit !== null && activeCount >= entitlement.clientLimit) {
      throw new EntitlementError("TRIAL_CLIENT_LIMIT_REACHED", TRIAL_CLIENT_LIMIT_MESSAGE);
    }
    return;
  }

  await assertClientCreateAllowed(workspaceId);
}

export async function assertInvoiceCreateEntitlement(workspaceId: string): Promise<void> {
  await assertWorkspaceMutationAllowed(workspaceId, "invoice_create");
  const entitlement = await getWorkspaceEntitlementState(workspaceId);

  if (entitlement.state === "trial") {
    const usage = await loadEntitlementUsage(workspaceId);
    if (isTrialUsageExhausted(usage, "trial_invoices")) {
      throw trialUsageError("trial_invoices");
    }
    return;
  }

  await assertInvoiceCreateAllowed(workspaceId);
}

export async function recordTrialInvoiceCreated(workspaceId: string): Promise<void> {
  // Trial invoice usage is consumed atomically by the invoices INSERT trigger.
  void workspaceId;
}

export type TrialUsageReservation = {
  reservationId: string;
  resource: TrialUsageResource;
};

async function reserveTrialUsage(
  workspaceId: string,
  resource: TrialUsageResource,
  reservationId: string,
  amount = 1
): Promise<TrialUsageReservation | null> {
  const entitlement = await getWorkspaceEntitlementState(workspaceId);
  if (entitlement.state !== "trial") {
    return null;
  }
  const result = await reserveEntitlementUsage(
    workspaceId,
    resource,
    reservationId,
    amount
  );
  if (!result.ok) {
    throw trialUsageError(resource);
  }
  return { reservationId, resource };
}

export async function releaseTrialUsageReservation(
  workspaceId: string,
  resource: TrialUsageResource,
  reservationId: string,
  amount = 1
): Promise<void> {
  const entitlement = await getWorkspaceEntitlementState(workspaceId);
  if (entitlement.state !== "trial") {
    return;
  }
  await releaseEntitlementUsage(workspaceId, resource, reservationId, amount);
}

export async function finalizeTrialUsageReservation(
  workspaceId: string,
  reservationId: string
): Promise<void> {
  const entitlement = await getWorkspaceEntitlementState(workspaceId);
  if (entitlement.state !== "trial") {
    return;
  }
  await finalizeEntitlementUsage(workspaceId, reservationId);
}

export async function reserveAiGenerationSlot(
  workspaceId: string
): Promise<TrialUsageReservation | null> {
  await assertWorkspaceMutationAllowed(workspaceId, "ai_generate");
  const reservationId = randomUUID();
  return reserveTrialUsage(workspaceId, "ai_generations", reservationId, 1);
}

export async function assertManualReminderQuotaAvailable(workspaceId: string): Promise<void> {
  await assertWorkspaceMutationAllowed(workspaceId, "reminder_send_manual");
  const entitlement = await getWorkspaceEntitlementState(workspaceId);
  if (entitlement.state !== "trial") {
    return;
  }
  const usage = await loadEntitlementUsage(workspaceId);
  if (isTrialUsageExhausted(usage, "manual_email_reminders")) {
    throw trialUsageError("manual_email_reminders");
  }
}

export async function reserveManualEmailReminderSlot(
  workspaceId: string
): Promise<TrialUsageReservation | null> {
  await assertWorkspaceMutationAllowed(workspaceId, "reminder_send_manual");
  const reservationId = randomUUID();
  return reserveTrialUsage(workspaceId, "manual_email_reminders", reservationId, 1);
}

export async function reserveAutomatedReminderSlot(
  workspaceId: string
): Promise<
  | { ok: true; reservation: TrialUsageReservation | null }
  | { ok: false; reason: string }
> {
  const entitlement = await getWorkspaceEntitlementState(workspaceId);

  if (entitlement.state === "trial_expired" || !entitlement.canMutate) {
    return { ok: false, reason: "trial_expired" };
  }

  if (entitlement.state === "paid") {
    return { ok: true, reservation: null };
  }

  if (entitlement.state !== "trial") {
    return { ok: false, reason: "not_entitled" };
  }

  const reservationId = randomUUID();
  try {
    const reservation = await reserveTrialUsage(
      workspaceId,
      "automated_reminders",
      reservationId,
      1
    );
    return { ok: true, reservation };
  } catch (error) {
    if (error instanceof EntitlementError) {
      return { ok: false, reason: "trial_automation_limit_reached" };
    }
    throw error;
  }
}

/** Non-consuming execution gate for cron runner (reservation happens at send time). */
export async function assertAutomatedReminderExecutionEntitlement(
  workspaceId: string
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const entitlement = await getWorkspaceEntitlementState(workspaceId);

  if (entitlement.state === "trial_expired" || !entitlement.canMutate) {
    return { ok: false, reason: "trial_expired" };
  }

  if (entitlement.state === "paid") {
    return { ok: true };
  }

  if (entitlement.state !== "trial") {
    return { ok: false, reason: "not_entitled" };
  }

  const usage = await loadEntitlementUsage(workspaceId);
  if (isTrialUsageExhausted(usage, "automated_reminders")) {
    return { ok: false, reason: "trial_automation_limit_reached" };
  }

  return { ok: true };
}

/** @deprecated Use reserveAiGenerationSlot */
export async function assertAiGenerationEntitlement(workspaceId: string): Promise<void> {
  await reserveAiGenerationSlot(workspaceId);
}

/** @deprecated Reservation is kept on success; release on failure via releaseTrialUsageReservation */
export async function recordSuccessfulAiGeneration(workspaceId: string): Promise<void> {
  void workspaceId;
}

/** @deprecated Use reserveManualEmailReminderSlot */
export async function assertManualReminderSendEntitlement(workspaceId: string): Promise<void> {
  await reserveManualEmailReminderSlot(workspaceId);
}

/** @deprecated Reservation is kept on success; release on failure via releaseTrialUsageReservation */
export async function recordSuccessfulAutomatedReminder(workspaceId: string): Promise<void> {
  void workspaceId;
}

/** @deprecated Reservation is kept on success; release on failure via releaseTrialUsageReservation */
export async function recordSuccessfulManualEmailReminder(workspaceId: string): Promise<void> {
  void workspaceId;
}

export async function assertImportEntitlement(
  workspaceId: string,
  params: { newClients: number; newInvoices: number }
): Promise<void> {
  await assertWorkspaceMutationAllowed(workspaceId, "csv_import");
  const entitlement = await getWorkspaceEntitlementState(workspaceId);

  if (entitlement.state === "trial") {
    const usage = await loadEntitlementUsage(workspaceId);
    const activeClients = await countActiveClientsForPlan(workspaceId);
    const remainingClients =
      entitlement.clientLimit === null
        ? Number.POSITIVE_INFINITY
        : Math.max(0, entitlement.clientLimit - activeClients);
    if (params.newClients > remainingClients) {
      throw new EntitlementError("TRIAL_CLIENT_LIMIT_REACHED", TRIAL_CLIENT_LIMIT_MESSAGE);
    }
    const remainingInvoices = getRemainingTrialUsage(usage, "trial_invoices");
    if (params.newInvoices > remainingInvoices) {
      throw new EntitlementError("TRIAL_INVOICE_LIMIT_REACHED", TRIAL_INVOICE_LIMIT_MESSAGE);
    }
    return;
  }

  if (params.newClients > 0) {
    const activeClients = await countActiveClientsForPlan(workspaceId);
    const limit = entitlement.clientLimit;
    if (limit !== null && activeClients + params.newClients > limit) {
      throw new EntitlementError("PLAN_LIMIT_CLIENTS", TRIAL_CLIENT_LIMIT_MESSAGE);
    }
  }

  if (params.newInvoices > 0 && entitlement.invoiceLimitMonthly !== null) {
    const { getInvoiceUsageThisMonth } = await import("./getInvoiceUsageThisMonth");
    const invoiceUsage = await getInvoiceUsageThisMonth(workspaceId);
    if (invoiceUsage.used + params.newInvoices > (invoiceUsage.limit ?? 0)) {
      throw new EntitlementError("PLAN_LIMIT_INVOICES", TRIAL_INVOICE_LIMIT_MESSAGE);
    }
  }
}

export async function assertWhatsAppCollectionEntitlement(workspaceId: string): Promise<void> {
  await assertWorkspaceMutationAllowed(workspaceId, "whatsapp_collection");
}
