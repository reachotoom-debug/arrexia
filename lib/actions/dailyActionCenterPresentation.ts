import { formatExposureLabelFromTotals } from "@/lib/reminders/remindersCenterPresentation";
import type { CurrencyExposureTotal, DailyActionSummary } from "./types";

export const NO_ACTIONS_SCHEDULED_TODAY = {
  title: "No collection actions scheduled for today.",
};

export function shouldShowOverduePortfolioEmptyState(
  summary: Pick<DailyActionSummary, "actionsTodayCount" | "overdueCollectibleCount">
): boolean {
  return summary.actionsTodayCount === 0 && summary.overdueCollectibleCount > 0;
}

export function formatOverduePortfolioEmptyContext(params: {
  overdueCollectibleCount: number;
  overdueCollectibleByCurrency: CurrencyExposureTotal[];
  defaultCurrency: string;
}): string {
  const { overdueCollectibleCount, overdueCollectibleByCurrency, defaultCurrency } = params;
  const exposure = formatExposureLabelFromTotals(
    overdueCollectibleByCurrency,
    defaultCurrency
  );
  const invoiceWord = overdueCollectibleCount === 1 ? "invoice" : "invoices";
  return `You still have ${exposure.value} overdue across ${overdueCollectibleCount} ${invoiceWord}.`;
}
