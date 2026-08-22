import {
  TRIAL_CLIENT_LIMIT,
  TRIAL_DURATION_DAYS,
  TRIAL_INVOICE_LIMIT_TOTAL,
} from "./trialConfig";

export type WorkspacePlan = "free" | "starter" | "pro" | "business";

/** Includes future tiers shown in marketing/billing UI but not yet stored in DB. */
export type PlanId = WorkspacePlan | "enterprise";

export const WORKSPACE_PLAN_RANK: Record<WorkspacePlan, number> = {
  free: 0,
  starter: 1,
  pro: 2,
  business: 3,
};

export function getWorkspacePlanRank(plan: WorkspacePlan): number {
  return WORKSPACE_PLAN_RANK[plan];
}

export type BillingInterval = "monthly" | "annual";

export function parseBillingInterval(value: string | null | undefined): BillingInterval | null {
  if (value === "monthly" || value === "annual") {
    return value;
  }
  return null;
}

/** Legacy or missing rows are treated as monthly paid cadence. */
export function normalizeBillingInterval(value: string | null | undefined): BillingInterval {
  return value === "annual" ? "annual" : "monthly";
}

export function formatBillingIntervalLabel(interval: BillingInterval): string {
  return interval === "annual" ? "Annual" : "Monthly";
}

export const PUBLIC_PRICING = {
  trialLabel: "Try Arrexia free",
  trialHeadline: `${TRIAL_DURATION_DAYS}-day free trial`,
  trialMicrocopy: "No credit card required",
  trialClientAllowanceLabel: `Up to ${TRIAL_CLIENT_LIMIT} clients`,
  trialInvoiceAllowanceLabel: `${TRIAL_INVOICE_LIMIT_TOTAL} invoices during your trial`,
  trialSameOnEveryPlanNote: "Same trial on every plan.",
  paidLimitsNote: "Limits below apply after paid activation.",
  /** Billing toggle label when annual is available. */
  annualToggleLabel: "Annual — 2 months free",
  annualTwoMonthsFreeLabel: "2 months free",
  /** @deprecated Use annualToggleLabel */
  annualSavingsLabel: "Annual — 2 months free",
  annualSavingsShortLabel: "2 months free",
} as const;

/** Compact public trial terms for pricing cards and hero sections. */
export function formatPublicTrialMicrocopy(): string {
  return [
    PUBLIC_PRICING.trialHeadline,
    PUBLIC_PRICING.trialClientAllowanceLabel,
    PUBLIC_PRICING.trialInvoiceAllowanceLabel,
    PUBLIC_PRICING.trialMicrocopy,
  ].join(" · ");
}

export function getPublicTrialMicrocopyLines(): readonly string[] {
  return [
    PUBLIC_PRICING.trialHeadline,
    `${PUBLIC_PRICING.trialClientAllowanceLabel} · ${PUBLIC_PRICING.trialInvoiceAllowanceLabel}`,
    PUBLIC_PRICING.trialMicrocopy,
  ] as const;
}

export type PlanDefinition = {
  id: PlanId;
  name: string;
  description: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  comingSoon: boolean;
  contactSalesOnly: boolean;
  /** Shown on settings billing cards. Enterprise is Contact Sales only. */
  selectableInBilling: boolean;
  mostPopular: boolean;
  publicCtaLabel: string;
  limits: readonly string[];
  invoiceLimitMonthly: number | null;
  clientLimit: number | null;
  workspaceMemberLimit: number | null;
};

export const PLAN_DEFINITIONS: Record<PlanId, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    description: "Legacy trial tier for existing workspaces.",
    monthlyPrice: 0,
    annualPrice: 0,
    comingSoon: false,
    contactSalesOnly: false,
    selectableInBilling: false,
    mostPopular: false,
    publicCtaLabel: "Get started free",
    limits: ["5 invoices / month", "5 clients"],
    invoiceLimitMonthly: 5,
    clientLimit: 5,
    workspaceMemberLimit: 1,
  },
  starter: {
    id: "starter",
    name: "Starter",
    description: "For freelancers and small businesses.",
    monthlyPrice: 39,
    annualPrice: 390,
    comingSoon: false,
    contactSalesOnly: false,
    selectableInBilling: true,
    mostPopular: false,
    publicCtaLabel: "Start Free Trial",
    limits: [
      "Up to 25 active clients",
      "Up to 50 invoices / month",
      "1 workspace member",
    ],
    invoiceLimitMonthly: 50,
    clientLimit: 25,
    workspaceMemberLimit: 1,
  },
  pro: {
    id: "pro",
    name: "Pro",
    description: "For growing agencies and finance teams.",
    monthlyPrice: 89,
    annualPrice: 890,
    comingSoon: false,
    contactSalesOnly: false,
    selectableInBilling: true,
    mostPopular: true,
    publicCtaLabel: "Start Free Trial",
    limits: [
      "Up to 250 active clients",
      "Up to 500 invoices / month",
      "Up to 3 workspace members",
    ],
    invoiceLimitMonthly: 500,
    clientLimit: 250,
    workspaceMemberLimit: 3,
  },
  business: {
    id: "business",
    name: "Business",
    description: "For larger teams with advanced needs.",
    monthlyPrice: 199,
    annualPrice: 1990,
    comingSoon: false,
    contactSalesOnly: false,
    selectableInBilling: true,
    mostPopular: false,
    publicCtaLabel: "Start Free Trial",
    limits: [
      "Unlimited clients and invoices",
      "Full collections workflows",
      "Automated reminders",
      "Priority support",
    ],
    invoiceLimitMonthly: null,
    clientLimit: null,
    workspaceMemberLimit: null,
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    description: "Custom terms, security, and volume pricing for larger organizations.",
    monthlyPrice: null,
    annualPrice: null,
    comingSoon: false,
    contactSalesOnly: true,
    selectableInBilling: false,
    mostPopular: false,
    publicCtaLabel: "Contact Sales",
    limits: [
      "Custom usage limits",
      "Dedicated onboarding",
      "Security review support",
      "Priority support",
    ],
    invoiceLimitMonthly: null,
    clientLimit: null,
    workspaceMemberLimit: null,
  },
};

/** Plans rendered on the public pricing page. */
export const PUBLIC_PRICING_PLANS: PlanId[] = ["starter", "pro", "business", "enterprise"];

/** Plans rendered on the settings billing page. */
export const BILLING_UI_PLANS: PlanId[] = ["starter", "pro", "business"];

/** Plans users can assign to a workspace today (stored in workspace_plans). */
export const ASSIGNABLE_WORKSPACE_PLANS: WorkspacePlan[] = [
  "free",
  "starter",
  "pro",
  "business",
];

export function isWorkspacePlan(value: string): value is WorkspacePlan {
  return ASSIGNABLE_WORKSPACE_PLANS.includes(value as WorkspacePlan);
}

export function getPlanDefinition(planId: PlanId): PlanDefinition {
  return PLAN_DEFINITIONS[planId];
}

export function formatPlanLabel(planId: string): string {
  if (planId in PLAN_DEFINITIONS) {
    return PLAN_DEFINITIONS[planId as PlanId].name;
  }
  return planId.charAt(0).toUpperCase() + planId.slice(1);
}

export function formatPublicUsd(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Monthly equivalent and other sub-dollar annual figures on public pricing. */
export function formatPublicUsdPrecise(amount: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export type PublicAnnualPricingDetails = {
  annualCharge: number;
  annualChargeFormatted: string;
  normalAnnualValue: number;
  normalAnnualValueFormatted: string;
  savingsAmount: number;
  savingsFormatted: string;
  savingsLabel: string;
  monthlyEquivalentFormatted: string;
};

/** Derived from frozen monthly × 12 and catalog annualPrice — presentation only. */
export function getPublicAnnualPricingDetails(
  planId: "starter" | "pro" | "business",
): PublicAnnualPricingDetails {
  const plan = PLAN_DEFINITIONS[planId];
  const monthly = plan.monthlyPrice ?? 0;
  const annual = plan.annualPrice ?? 0;
  const normalAnnualValue = monthly * 12;
  const savingsAmount = normalAnnualValue - annual;
  const monthlyEquivalent = annual / 12;

  const savingsFormatted = formatPublicUsd(savingsAmount);

  return {
    annualCharge: annual,
    annualChargeFormatted: formatPublicUsd(annual),
    normalAnnualValue,
    normalAnnualValueFormatted: formatPublicUsd(normalAnnualValue),
    savingsAmount,
    savingsFormatted,
    savingsLabel: `Save ${savingsFormatted} — ${PUBLIC_PRICING.annualTwoMonthsFreeLabel}`,
    monthlyEquivalentFormatted: formatPublicUsdPrecise(monthlyEquivalent),
  };
}

export function formatMonthlyPrice(planId: PlanId): string {
  const plan = getPlanDefinition(planId);
  if (plan.contactSalesOnly) return "Contact Sales";
  if (plan.comingSoon) return "Coming soon";
  if (plan.monthlyPrice === null || plan.monthlyPrice === 0) return "$0/mo";
  return `$${plan.monthlyPrice}/mo`;
}

export function formatPaidSubscriptionPrice(
  planId: WorkspacePlan,
  interval: BillingInterval
): string {
  const plan = getPlanDefinition(planId);
  if (interval === "annual" && plan.annualPrice) {
    return `${formatPublicUsd(plan.annualPrice)}/year`;
  }
  if (plan.monthlyPrice === null) {
    return "Contact Sales";
  }
  return `$${plan.monthlyPrice}/mo`;
}

export function getPlanStorageLimits(plan: WorkspacePlan): {
  invoice_limit_monthly: number | null;
  client_limit: number | null;
} {
  const definition = PLAN_DEFINITIONS[plan];
  return {
    invoice_limit_monthly: definition.invoiceLimitMonthly,
    client_limit: definition.clientLimit,
  };
}

/** True when the workspace can move to a higher paid tier in settings. */
export function isUpgradeAvailable(plan: WorkspacePlan): boolean {
  return getWorkspacePlanRank(plan) < getWorkspacePlanRank("business");
}

/** Billing UI plan cards omit member quotas until invite enforcement ships. */
export function getBillingUiPlanLimits(planId: PlanId): string[] {
  return getPlanDefinition(planId).limits.filter(
    (line) => !/\b(member|members|user|users)\b/i.test(line)
  );
}

export type PublicPlanPricingDisplay = {
  price: string;
  period: string;
  /** Shown under annual charge — e.g. "$468 normally" */
  normalValueSubtext?: string;
  equivalentSubtext?: string;
  savingsBadge?: string;
};

export function getPublicPlanPricing(
  planId: "starter" | "pro" | "business",
  interval: BillingInterval,
): PublicPlanPricingDisplay {
  const plan = PLAN_DEFINITIONS[planId];

  if (interval === "annual" && plan.annualPrice) {
    const annual = getPublicAnnualPricingDetails(planId);
    return {
      price: annual.annualChargeFormatted,
      period: "/year",
      normalValueSubtext: `${annual.normalAnnualValueFormatted} normally`,
      savingsBadge: annual.savingsLabel,
      equivalentSubtext: `${annual.monthlyEquivalentFormatted}/mo billed annually`,
    };
  }

  return {
    price: `$${plan.monthlyPrice}`,
    period: "/mo",
  };
}

export function getPublicComparisonPrices(interval: BillingInterval) {
  const starter = PLAN_DEFINITIONS.starter;
  const pro = PLAN_DEFINITIONS.pro;
  const business = PLAN_DEFINITIONS.business;

  if (interval === "annual") {
    return {
      starter: `${formatPublicUsd(starter.annualPrice!)}/yr`,
      pro: `${formatPublicUsd(pro.annualPrice!)}/yr`,
      business: `${formatPublicUsd(business.annualPrice!)}/yr`,
      enterprise: "Contact Sales",
    };
  }

  return {
    starter: `$${starter.monthlyPrice}/mo`,
    pro: `$${pro.monthlyPrice}/mo`,
    business: `$${business.monthlyPrice}/mo`,
    enterprise: "Contact Sales",
  };
}

/** Full comparison-table price cell (monthly + annual). */
export function formatPublicComparisonPriceRow(
  planId: "starter" | "pro" | "business" | "enterprise",
): string {
  const plan = PLAN_DEFINITIONS[planId];

  if (plan.contactSalesOnly) {
    return "Contact Sales";
  }

  if (plan.annualPrice) {
    return `$${plan.monthlyPrice}/mo or ${formatPublicUsd(plan.annualPrice)}/yr`;
  }

  return `$${plan.monthlyPrice}/mo`;
}

/** Homepage / marketing teaser price label. */
export function getPublicTeaserPriceDisplay(planId: PlanId): {
  price: string;
  suffix: string;
} {
  const plan = getPlanDefinition(planId);

  if (plan.contactSalesOnly) {
    return { price: "Contact Sales", suffix: "" };
  }

  if (plan.monthlyPrice === null) {
    return { price: "Coming soon", suffix: "" };
  }

  return {
    price: `$${plan.monthlyPrice}`,
    suffix: "/month",
  };
}

export {
  buildMailtoHref,
  getEnterpriseContactHref,
  getGeneralContactMailtoHref,
  getSupportContactMailtoHref,
  PUBLIC_ARREXIA_EMAIL_ADDRESSES,
  PUBLIC_CONTACT_CHANNELS,
} from "@/lib/email/publicAddresses";

export function trialHref(plan?: "starter" | "pro" | "business") {
  if (plan === "starter" || plan === "pro" || plan === "business") {
    return `/register?plan=${plan}`;
  }
  return "/register";
}
