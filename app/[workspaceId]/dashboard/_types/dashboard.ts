/**
 * Dashboard data types - Dashboard v3
 */

export interface DashboardSummary {
  totalInvoiced12m: number;
  totalCollected12m: number;
  totalOutstandingNow: number;
  overdueAmountNow: number;
  highRiskExposureNow: number;
  dsoRolling3m: number | null;
}

export interface DashboardSeries {
  invoicedMonthly: { month: string; amount: number }[];
  collectedMonthly: { month: string; amount: number }[];
  overdueMonthly: { month: string; amount: number; count: number }[];
  agingBuckets: {
    bucket: "0-30" | "31-60" | "61-90" | "90+";
    amount: number;
  }[];
}

export interface RiskOverview {
  high: { invoiceCount: number; amount: number };
  medium: { invoiceCount: number; amount: number };
  low: { invoiceCount: number; amount: number };
}

export interface UpcomingDueItem {
  id: string;
  invoiceNumber: string;
  clientName: string;
  dueDate: string;
  totalAmount: number;
  outstanding: number;
  status: "sent" | "partially_paid" | "draft";
}

export interface CollectionsWorkItem {
  id: string;
  invoiceNumber: string;
  clientName: string;
  dueDate: string;
  overdueDays: number;
  outstanding: number;
  riskLevel: "high" | "medium" | "low" | null;
  primaryEmail?: string | null;
  primaryPhone?: string | null;
}

export interface ActivityItem {
  id: string;
  type: "invoice" | "payment";
  invoiceNumber?: string; // Optional - guarded in ActivityFeed.tsx with `item.invoiceNumber ?`
  clientName: string;
  date: string;
  amount: number;
  statusLabel: string;
}

export interface ArFocusData {
  collectibleOutstanding: number;
  overdueAmount: number;
  highRiskExposure: number;
  overdueInvoicesCount: number;
  topOverdueClients: { clientName: string; overdueAmount: number }[];
  topOverdueClientsHasMore: boolean;
  overdueInvoices: CollectionsWorkItem[];
  overdueInvoicesHasMore: boolean;
}

export interface OwnerOverviewData {
  last30: {
    totalInvoiced: number;
    totalCollected: number;
    collectionRate: number | null;
    dso: number | null;
  };
  funnel: {
    status: "paid" | "overdue" | "sent" | "draft";
    amount: number;
    count: number;
  }[];
  bestClients: {
    clientName: string;
    collected: number;
    avgDays: number | null;
    invoices: number;
  }[];
  bestClientsHasMore: boolean;
  problemClients: {
    clientName: string;
    avgDaysOverdue: number;
    outstanding: number;
    invoiceCount: number;
  }[];
  problemClientsHasMore: boolean;
}

export interface CollectionsModeData {
  invoicesInView: number;
  outstandingInView: number;
  worklist: CollectionsWorkItem[];
  worklistHasMore: boolean;
  totalCount: number;
}

export type InsightSeverity = "good" | "neutral" | "warning" | "critical";

export interface DashboardInsight {
  title: string;
  message: string;
  severity: InsightSeverity;
  primaryMetricLabel: string;
  primaryMetricValue: string;
  deltaLabel?: string;
  deltaValue?: string;
}

export interface ReminderEffectivenessData {
  month: string;
  remindersSent: number;
  paymentsReceived: number;
}

export interface TopHighRiskClient {
  clientId: string;
  clientName: string;
  overdueAmount: number;
  maxOverdueDays: number;
}

export interface DashboardData {
  summary: DashboardSummary;
  series: DashboardSeries;
  riskOverview: RiskOverview;
  upcomingDue: UpcomingDueItem[];
  recentActivity: ActivityItem[];
  recentActivityHasMore: boolean;
  arFocus: ArFocusData;
  ownerOverview: OwnerOverviewData;
  collectionsMode: CollectionsModeData;
  insight: DashboardInsight;
  reminderEffectiveness: ReminderEffectivenessData[];
}
