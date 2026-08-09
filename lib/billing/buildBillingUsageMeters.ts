import type { BillingUsageMeter } from "./billingUsageTypes";
import type { EntitlementState } from "./resolveWorkspaceEntitlement";
import { TRIAL_USAGE_LIMITS } from "./trialConfig";
import type { EntitlementUsageSnapshot } from "./usageMetering";

function buildFiniteMeter(
  id: BillingUsageMeter["id"],
  label: string,
  used: number,
  limit: number | null,
  options: {
    periodType?: BillingUsageMeter["periodType"];
    periodLabel?: string;
    remainingCopy?: string;
  } = {}
): BillingUsageMeter {
  const unlimited = limit === null;
  const remaining = unlimited ? null : Math.max(0, limit - used);

  return {
    id,
    label,
    used,
    limit,
    remaining,
    unlimited,
    periodType: options.periodType,
    periodLabel: options.periodLabel,
    remainingCopy:
      options.remainingCopy ??
      (unlimited ? "Unlimited" : `${remaining} remaining`),
  };
}

export function buildBillingUsageMeters(input: {
  entitlementState: EntitlementState;
  clientUsage: { activeClientCount: number; clientLimit: number | null };
  invoiceUsage: { used: number; limit: number | null };
  entitlementUsage?: EntitlementUsageSnapshot;
}): BillingUsageMeter[] {
  const meters: BillingUsageMeter[] = [
    buildFiniteMeter(
      "clients",
      "Clients",
      input.clientUsage.activeClientCount,
      input.clientUsage.clientLimit,
      {
        remainingCopy:
          input.clientUsage.clientLimit === null
            ? "Unlimited"
            : `${Math.max(0, input.clientUsage.clientLimit - input.clientUsage.activeClientCount)} client slots remaining`,
      }
    ),
  ];

  const usage = input.entitlementUsage ?? {
    workspace_id: "",
    trial_invoices_created: 0,
    ai_generations_successful: 0,
    automated_reminders_sent: 0,
    manual_email_reminders_sent: 0,
  };

  if (input.entitlementState === "trial") {
    meters.push(
      buildFiniteMeter("invoices", "Invoices", input.invoiceUsage.used, input.invoiceUsage.limit, {
        periodType: "trial_lifetime",
        periodLabel: "Trial allowance · does not reset",
      }),
      buildFiniteMeter(
        "ai",
        "AI generations",
        usage.ai_generations_successful,
        TRIAL_USAGE_LIMITS.ai_generations,
        {
          remainingCopy: `${Math.max(0, TRIAL_USAGE_LIMITS.ai_generations - usage.ai_generations_successful)} AI generations remaining`,
        }
      ),
      buildFiniteMeter(
        "automated_reminders",
        "Automated reminders",
        usage.automated_reminders_sent,
        TRIAL_USAGE_LIMITS.automated_reminders,
        {
          remainingCopy: `${Math.max(0, TRIAL_USAGE_LIMITS.automated_reminders - usage.automated_reminders_sent)} automated reminders remaining`,
        }
      ),
      buildFiniteMeter(
        "manual_email_reminders",
        "Manual email reminders",
        usage.manual_email_reminders_sent,
        TRIAL_USAGE_LIMITS.manual_email_reminders,
        {
          remainingCopy: `${Math.max(0, TRIAL_USAGE_LIMITS.manual_email_reminders - usage.manual_email_reminders_sent)} manual email reminders remaining`,
        }
      )
    );
  } else if (input.entitlementState === "paid") {
    meters.push(
      buildFiniteMeter(
        "invoices",
        "Invoices this month",
        input.invoiceUsage.used,
        input.invoiceUsage.limit,
        {
          periodType: "monthly",
          periodLabel: "Monthly allowance · Resets monthly",
        }
      )
    );
  } else if (input.entitlementState === "trial_expired") {
    meters.push(
      buildFiniteMeter("invoices", "Invoices", input.invoiceUsage.used, input.invoiceUsage.limit, {
        periodType: "trial_lifetime",
        periodLabel: "Trial allowance · does not reset",
      }),
      buildFiniteMeter(
        "ai",
        "AI generations",
        usage.ai_generations_successful,
        TRIAL_USAGE_LIMITS.ai_generations
      ),
      buildFiniteMeter(
        "automated_reminders",
        "Automated reminders",
        usage.automated_reminders_sent,
        TRIAL_USAGE_LIMITS.automated_reminders
      ),
      buildFiniteMeter(
        "manual_email_reminders",
        "Manual email reminders",
        usage.manual_email_reminders_sent,
        TRIAL_USAGE_LIMITS.manual_email_reminders
      )
    );
  }

  return meters;
}
