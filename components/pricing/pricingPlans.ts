import type { FeatureItem } from "./FeatureList";
import {
  getPublicComparisonPrices,
  getPublicPlanPricing,
  getPublicTeaserPriceDisplay,
  trialHref,
  type BillingInterval,
} from "@/lib/billing/plans";

export type { BillingInterval };

export const STARTER_FEATURES: readonly FeatureItem[] = [
  { label: "Up to 25 active clients" },
  { label: "Up to 50 invoices per month" },
  { label: "1 workspace member" },
  { label: "Client management" },
  { label: "Invoice management" },
  { label: "Manual payment tracking" },
  { label: "Branded PDF invoices" },
  { label: "Basic dashboard" },
  { label: "Basic risk score" },
  { label: "Manual reminders" },
  { label: "Reminder history" },
  { label: "Export data" },
];

export const PRO_FEATURES: readonly FeatureItem[] = [
  { label: "Everything in Starter" },
  { label: "Up to 250 active clients" },
  { label: "Up to 500 invoices per month" },
  { label: "Up to 3 workspace members" },
  { label: "Automated reminder rules" },
  { label: "Suggested reminders" },
  { label: "Collection workflows" },
  { label: "Advanced risk analysis" },
  { label: "Collections dashboard" },
  { label: "Email templates" },
  { label: "CSV import/export" },
  { label: "Priority support" },
];

export const BUSINESS_FEATURES: readonly FeatureItem[] = [
  { label: "Team permissions", comingSoon: true },
  { label: "Custom domain", comingSoon: true },
  { label: "Branded sending email", comingSoon: true },
  { label: "API access", comingSoon: true },
  { label: "Advanced analytics", comingSoon: true },
  { label: "Higher usage limits", comingSoon: true },
];

export function getStarterPricing(interval: BillingInterval) {
  return getPublicPlanPricing("starter", interval);
}

export function getProPricing(interval: BillingInterval) {
  return getPublicPlanPricing("pro", interval);
}

export function getComparisonPrices(interval: BillingInterval) {
  return getPublicComparisonPrices(interval);
}

export { trialHref, getPublicTeaserPriceDisplay };
