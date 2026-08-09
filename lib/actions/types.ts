import type { EligibleReminderCandidate } from "@/lib/reminders/getEligibleReminders";
import type { AgingMilestoneDays } from "./collectionActivity";
import type { CollectionActionExecution } from "./resolveCollectionActionExecution";

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
  clientPhone: string | null;
  clientCountry: string | null;
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
  clientId: string | null;
  invoiceNumber: string | null;
  clientName: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  clientCountry: string | null;
  dueDate: string | null;
  outstanding: number;
  currency: string | null;
  displayStatus: string | null;
  overdueDays: number;
  isHighRisk: boolean;
  reasons: ActionReason[];
  execution?: CollectionActionExecution;
  recommendedAction?: string;
};

export type CurrencyExposureTotal = {
  currency: string;
  amount: number;
};

export type DailyActionSummary = {
  actionsTodayCount: number;
  requiringAttentionAmount: number | null;
  requiringAttentionCurrency: string;
  requiringAttentionMixedCurrency: boolean;
  requiringAttentionByCurrency: CurrencyExposureTotal[];
  overdueCollectibleCount: number;
  overdueCollectibleByCurrency: CurrencyExposureTotal[];
  remindersDueCount: number;
  highRiskCustomerCount: number;
  newlyOverdueCount: number;
  sentInvoiceCount: number;
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
  businessName: string;
  workspaceTimeZone: string;
  evaluationDate: string;
};

export type DailyActionCenterPagination = {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  pageSize: number;
};

export const DAILY_ACTION_CENTER_PAGE_SIZE = 10 as const;
