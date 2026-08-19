import type { FeatureItem } from "./FeatureList";
import {
  getPublicComparisonPrices,
  getPublicPlanPricing,
  getPublicTeaserPriceDisplay,
  getEnterpriseContactHref,
  trialHref,
  type BillingInterval,
} from "@/lib/billing/plans";

export type { BillingInterval };

export const STARTER_CAPACITY: readonly FeatureItem[] = [
  { label: "Up to 25 active clients" },
  { label: "Up to 50 invoices per month" },
];

export const PRO_CAPACITY: readonly FeatureItem[] = [
  { label: "Up to 250 active clients" },
  { label: "Up to 500 invoices per month" },
];

export const BUSINESS_CAPACITY: readonly FeatureItem[] = [
  { label: "Unlimited clients and invoices" },
];

export const STARTER_FEATURES: readonly FeatureItem[] = [
  { label: "Client & invoice management" },
  { label: "Manual payment tracking" },
  { label: "Branded PDF invoices" },
  { label: "Basic dashboard & risk score" },
  { label: "Manual reminders & reminder history" },
  { label: "Export data" },
];

export const PRO_FEATURES: readonly FeatureItem[] = [
  { label: "Everything in Starter" },
  { label: "Automated reminder rules" },
  { label: "Suggested reminders & collection workflows" },
  { label: "Advanced risk analysis & collections dashboard" },
  { label: "Email templates" },
  { label: "CSV import/export" },
  { label: "Priority support" },
];

export const BUSINESS_FEATURES: readonly FeatureItem[] = [
  { label: "Everything in Pro" },
  { label: "Advanced collections workflows" },
  { label: "Priority support" },
];

export function getStarterPricing(interval: BillingInterval) {
  return getPublicPlanPricing("starter", interval);
}

export function getProPricing(interval: BillingInterval) {
  return getPublicPlanPricing("pro", interval);
}

export function getBusinessPricing(interval: BillingInterval) {
  return getPublicPlanPricing("business", interval);
}

export function getComparisonPrices(interval: BillingInterval) {
  return getPublicComparisonPrices(interval);
}

export { trialHref, getPublicTeaserPriceDisplay, getEnterpriseContactHref };
