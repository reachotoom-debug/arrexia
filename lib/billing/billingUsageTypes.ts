import type { EntitlementState } from "./resolveWorkspaceEntitlement";

export type BillingUsageMeter = {
  id: "clients" | "invoices" | "ai" | "automated_reminders" | "manual_email_reminders";
  label: string;
  used: number;
  limit: number | null;
  remaining: number | null;
  unlimited: boolean;
  periodType?: "trial_lifetime" | "monthly";
  periodLabel?: string;
  remainingCopy: string;
};

export type BillingUsageSummary = {
  entitlementState: EntitlementState;
  meters: BillingUsageMeter[];
};
