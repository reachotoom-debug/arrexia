import type { EligibleReminderCandidate } from "@/lib/reminders/getEligibleReminders";
import type { AgingMilestoneDays } from "./collectionActivity";

export type ActionReason =
  | { type: "reminder_due" }
  | { type: "newly_overdue" }
  | { type: "aging_milestone"; milestoneDays: AgingMilestoneDays };

export type ChaseableInvoiceRow = {
  id: string;
  invoiceNumber: string | null;
  clientId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  dueDate: string | null;
  outstanding: number;
  currency: string | null;
  displayStatus: string | null;
  baseStatus: string | null;
  isOverdue: boolean;
  overdueDays: number;
  riskLevel: "high" | "medium" | "low" | null;
  clientIsActive: boolean;
  clientArchivedAt: string | null;
  archivedAt: string | null;
};

export type CollectionActionItem = {
  id: string;
  invoiceNumber: string | null;
  clientName: string | null;
  clientEmail: string | null;
  dueDate: string | null;
  outstanding: number;
  currency: string | null;
  displayStatus: string | null;
  overdueDays: number;
  isHighRisk: boolean;
  reasons: ActionReason[];
};

export type DailyActionSummary = {
  actionsTodayCount: number;
  requiringAttentionAmount: number | null;
  requiringAttentionCurrency: string;
  requiringAttentionMixedCurrency: boolean;
  remindersDueCount: number;
  newlyOverdueCount: number;
};

export type ReminderActionContext = {
  invoiceId: string;
  invoiceNumber: string | null;
  clientName: string | null;
  clientEmail: string | null;
  ruleId: string;
  templateId: string | null;
  scheduledDate: string;
};

export type DailyActionCenterData = {
  summary: DailyActionSummary;
  collectionActions: CollectionActionItem[];
  reminderActionsByInvoiceId: Record<string, ReminderActionContext>;
  eligibleReminders: EligibleReminderCandidate[];
};
