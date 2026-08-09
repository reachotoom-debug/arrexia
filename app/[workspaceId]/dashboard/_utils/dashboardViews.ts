export const DASHBOARD_VIEWS = ["standard", "ar-focus", "owner-overview"] as const;

export type DashboardView = (typeof DASHBOARD_VIEWS)[number];

export const DASHBOARD_VIEW_LABELS: Record<DashboardView, string> = {
  standard: "Overview",
  "ar-focus": "AR Focus",
  "owner-overview": "Performance",
};

export function resolveDashboardView(
  viewParam: string | undefined
): { view: DashboardView; legacyCollectionsMode: boolean } {
  if (viewParam === "collections-mode") {
    return { view: "standard", legacyCollectionsMode: true };
  }

  if (viewParam && DASHBOARD_VIEWS.includes(viewParam as DashboardView)) {
    return { view: viewParam as DashboardView, legacyCollectionsMode: false };
  }

  return { view: "standard", legacyCollectionsMode: false };
}
