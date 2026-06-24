export type WorkspacePlan = "free" | "starter" | "pro";

/** Includes future tiers shown in marketing/billing UI but not yet stored in DB. */
export type PlanId = WorkspacePlan | "business";

export type BillingInterval = "monthly" | "annual";

export type PlanDefinition = {
  id: PlanId;
  name: string;
  description: string;
  monthlyPrice: number | null;
  annualPrice: number | null;
  /** Display rate when billed annually, e.g. $32/mo on a $390/yr plan. */
  annualMonthlyEquivalent: number | null;
  comingSoon: boolean;
  /** Shown on settings billing cards; business is preview-only. */
  selectableInBilling: boolean;
  mostPopular: boolean;
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
    annualMonthlyEquivalent: null,
    comingSoon: false,
    selectableInBilling: false,
    mostPopular: false,
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
    annualMonthlyEquivalent: 32,
    comingSoon: false,
    selectableInBilling: true,
    mostPopular: false,
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
    annualMonthlyEquivalent: 74,
    comingSoon: false,
    selectableInBilling: true,
    mostPopular: true,
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
    annualPrice: null,
    annualMonthlyEquivalent: null,
    comingSoon: true,
    selectableInBilling: false,
    mostPopular: false,
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
};

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

export function formatMonthlyPrice(planId: PlanId): string {
  const plan = getPlanDefinition(planId);
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
  planId: "starter" | "pro",
  interval: BillingInterval
): PublicPlanPricingDisplay {
  const plan = PLAN_DEFINITIONS[planId];
  if (interval === "annual" && plan.annualPrice && plan.annualMonthlyEquivalent) {
    const annualSavings =
      plan.monthlyPrice !== null
        ? plan.monthlyPrice * 12 - plan.annualPrice
        : 0;
    return {
      price: `$${plan.annualMonthlyEquivalent}`,
      period: "/mo",
      equivalentSubtext: `Billed annually at $${plan.annualPrice}/year`,
      savingsBadge: annualSavings > 0 ? `Save $${annualSavings}/year` : undefined,
    };
  }

  return {
    price: `$${plan.monthlyPrice}`,
    period: "/mo",
  };
}

export function getPublicComparisonPrices(interval: BillingInterval) {
  if (interval === "annual") {
    return {
      starter: "$32/mo · $390/yr",
      pro: "$74/mo · $890/yr",
      business: "Coming soon",
    };
  }

  return {
    starter: "$39/mo",
    pro: "$89/mo",
    business: "Coming soon",
  };
}

export function trialHref(_plan?: "starter" | "pro") {
  return "/register";
}
