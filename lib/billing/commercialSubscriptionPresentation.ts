import { getPlanDefinition, type WorkspacePlan } from "./plans";
import type {
  EntitlementState,
  TrialDisplayInfo,
} from "./resolveWorkspaceEntitlement";

export type CommercialSubscriptionInput = {
  entitlementState: EntitlementState;
  paidPlan: WorkspacePlan | null;
  trial: TrialDisplayInfo | null;
};

export type CommercialSubscriptionPresentation = {
  planLabel: string;
  sidebarLabel: string;
  statusLabel: string;
  showUpgradeLink: boolean;
};

function formatTrialDaysRemaining(daysRemaining: number): string {
  if (daysRemaining === 1) {
    return "1 day left";
  }
  return `${daysRemaining} days left`;
}

export function getCommercialSubscriptionPresentation(
  input: CommercialSubscriptionInput
): CommercialSubscriptionPresentation {
  const { entitlementState, paidPlan, trial } = input;

  if (entitlementState === "trial" && trial?.status === "active") {
    const daysText = formatTrialDaysRemaining(trial.daysRemaining);
    return {
      planLabel: "Arrexia Free Trial",
      sidebarLabel: `Free trial · ${daysText}`,
      statusLabel: "Active",
      showUpgradeLink: true,
    };
  }

  if (entitlementState === "trial_expired") {
    return {
      planLabel: "Trial expired",
      sidebarLabel: "Trial expired",
      statusLabel: "Trial expired",
      showUpgradeLink: true,
    };
  }

  if (entitlementState === "paid" && paidPlan) {
    const name = getPlanDefinition(paidPlan).name;
    return {
      planLabel: name,
      sidebarLabel: name,
      statusLabel: "Active",
      showUpgradeLink: paidPlan !== "business",
    };
  }

  return {
    planLabel: "Free",
    sidebarLabel: "Free",
    statusLabel: "Active",
    showUpgradeLink: true,
  };
}
