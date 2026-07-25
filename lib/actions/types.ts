import type { EligibleReminderCandidate } from "@/lib/reminders/getEligibleReminders";

export type NeedsActionReason = "reminder_due" | "high_risk" | "newly_overdue";

export type ChaseableInvoiceRow = {
  id: string;
  invoiceNumber: string | null;
  clientId: string | null;
  clientName: string | null;
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

export type NeedsActionItem = {
  id: string;
  invoiceNumber: string | null;
  clientName: string | null;
  dueDate: string | null;
  outstanding: number;
  currency: string | null;
  displayStatus: string | null;
  overdueDays: number;
  reasons: NeedsActionReason[];
};

export type HighRiskItem = {
  id: string;
  invoiceNumber: string | null;
  clientName: string | null;
  dueDate: string | null;
  outstanding: number;
  currency: string | null;
  overdueDays: number;
};

export type DailyActionSummary = {
  needsActionCount: number;
  remindersDueCount: number;
  highRiskCount: number;
  overdueCount: number;
};

export type DailyActionCenterData = {
  summary: DailyActionSummary;
  needsAction: NeedsActionItem[];
  reminders: EligibleReminderCandidate[];
  highRisk: HighRiskItem[];
};

export type SuggestedReminderRow = {
  id: string;
  invoice_id: string;
  invoice_number: string | null;
  status: string | null;
  due_date: string | null;
  outstanding: number | null;
  currency: string | null;
  client: {
    id: string;
    name: string | null;
    email: string | null;
  } | null;
  days_from_due: number | null;
  tag: string;
  is_overdue: boolean;
  client_name: string | null;
  client_email: string | null;
  rule_id: string;
  rule_name: string;
  rule_label: string;
  template_id: string | null;
  scheduled_date: string;
};
