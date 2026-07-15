export type WorkspacePlan = "free" | "starter" | "pro";

/** Includes future tiers shown in marketing/billing UI but not yet stored in DB. */
export type PlanId = WorkspacePlan | "business" | "enterprise";

export type BillingInterval = "monthly" | "annual";

export const PUBLIC_PRICING = {
  trialDays: 14,
  trialLabel: "14-day free trial",
  trialMicrocopy: "14-day free trial • No credit card required",
  annualSavingsLabel: "Save 17% — 2 months free",
  annualSavingsShortLabel: "Save 17%",
} as const;

export type PlanDefinition = {
  id: PlanId;
  name: string;
  description: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  comingSoon: boolean;
  contactSalesOnly: boolean;
  /** Shown on settings billing cards; business/enterprise are preview-only. */
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
    publicCtaLabel: "Start free trial",
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
    publicCtaLabel: "Start free trial",
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
    publicCtaLabel: "Start free trial",
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
    selectableInBilling: false,
    mostPopular: false,
    publicCtaLabel: "Start free trial",
    limits: [
      "Team permissions",
      "Custom domain",
      "API access",
      "Higher usage limits",
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
export const ASSIGNABLE_WORKSPACE_PLANS: WorkspacePlan[] = ["free", "starter", "pro"];

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

export function formatMonthlyPrice(planId: PlanId): string {
  const plan = getPlanDefinition(planId);
  if (plan.contactSalesOnly) return "Contact Sales";
  if (plan.comingSoon) return "Coming soon";
  if (plan.monthlyPrice === null || plan.monthlyPrice === 0) return "$0/mo";
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
  return plan !== "pro";
}

export type PublicPlanPricingDisplay = {
  price: string;
  period: string;
  equivalentSubtext?: string;
  savingsBadge?: string;
};

export function getPublicPlanPricing(
  planId: "starter" | "pro" | "business",
  interval: BillingInterval,
): PublicPlanPricingDisplay {
  const plan = PLAN_DEFINITIONS[planId];

  if (interval === "annual" && plan.annualPrice) {
    return {
      price: formatPublicUsd(plan.annualPrice),
      period: "/year",
      savingsBadge: PUBLIC_PRICING.annualSavingsLabel,
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

export function getEnterpriseContactHref(): string {
  return "/contact";
}

export function trialHref(_plan?: "starter" | "pro" | "business") {
  return "/register";
}
