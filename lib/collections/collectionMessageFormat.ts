import { differenceCalendarDays } from "@/lib/reminders/ruleTrigger";

export const ARREXIA_WEBSITE_URL = "https://arrexia.app";
export const ARREXIA_BRAND_FOOTER_LINE = "Powered by Arrexia";

export const COLLECTION_MESSAGE_CTA =
  "Please let us know once payment has been arranged.";

export const COLLECTION_MESSAGE_ALREADY_PAID_DISCLAIMER =
  "If payment has already been made, kindly disregard this reminder.";

export function formatCollectionMessageStatusLine(params: {
  daysOverdue: number;
  dueDate?: string | null;
  evaluationDate?: string | null;
}): string {
  const { daysOverdue, dueDate } = params;

  if (daysOverdue > 0) {
    return daysOverdue === 1
      ? "Status: 1 day overdue"
      : `Status: ${daysOverdue} days overdue`;
  }

  if (dueDate) {
    const evaluationDate = params.evaluationDate?.trim();
    if (!evaluationDate) {
      throw new Error(
        "evaluationDate is required to derive collection message status when daysOverdue is 0"
      );
    }

    const daysDiff = differenceCalendarDays(evaluationDate, dueDate);

    if (daysDiff === null) {
      return "Status: Due today";
    }

    if (daysDiff === 0) {
      return "Status: Due today";
    }

    if (daysDiff < 0) {
      const daysUntil = Math.abs(daysDiff);
      return daysUntil === 1
        ? "Status: Due in 1 day"
        : `Status: Due in ${daysUntil} days`;
    }

    return daysDiff === 1
      ? "Status: 1 day overdue"
      : `Status: ${daysDiff} days overdue`;
  }

  return "Status: Due today";
}

export function buildCollectionMessageFooterLines(businessName: string): string[] {
  const name = businessName.trim() || "Your company";
  return ["Thank you,", name, ARREXIA_BRAND_FOOTER_LINE, ARREXIA_WEBSITE_URL];
}
