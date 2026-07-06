import { cache } from "react";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { assertAdmin } from "@/lib/admin/requireAdmin";
import { isPostgrestMissingTableError } from "@/lib/admin/postgrestErrors";
import {
  getPlanDefinition,
  isWorkspacePlan,
  PLAN_DEFINITIONS,
  type WorkspacePlan,
} from "@/lib/billing/plans";

const STARTER_MRR = PLAN_DEFINITIONS.starter.monthlyPrice ?? 29;
const PRO_MRR = PLAN_DEFINITIONS.pro.monthlyPrice ?? 79;

export type FounderOverviewData = {
  totalUsers: number;
  newUsersToday: number;
  newUsersThisMonth: number;
  newUsersThisYear: number;
  totalWorkspaces: number;
  activeWorkspaces30d: number;
  trialWorkspaces: number;
  paidSubscribers: number;
  estimatedMrr: number;
  estimatedArr: number;
  conversionRate: number;
  churnedWorkspaces: number;
  revenueDisclaimer: string;
};

export type FounderUserRow = {
  id: string;
  email: string | null;
  createdAt: string | null;
  lastSignInAt: string | null;
  workspaceCount: number;
};

export type FounderSubscriberRow = {
  userEmail: string | null;
  workspaceName: string;
  workspaceId: string;
  plan: WorkspacePlan;
  subscriptionStatus: string;
  trialStartsAt: string | null;
  trialEndsAt: string | null;
  renewalDate: string | null;
  estimatedMonthlyValue: number;
  estimatedYearlyValue: number;
  workspaceCreatedAt: string;
  lastSignInAt: string | null;
};

export type FounderRevenueData = {
  estimatedMrr: number;
  estimatedArr: number;
  mrrByPlan: Array<{ plan: WorkspacePlan; count: number; mrr: number }>;
  newMrrToday: number;
  newMrrThisMonth: number;
  newMrrThisYear: number;
  arpu: number;
  freeToPaidConversion: number;
  revenueDisclaimer: string;
};

export type FounderRenewalAlert = {
  workspaceId: string;
  workspaceName: string;
  ownerEmail: string | null;
  plan: WorkspacePlan;
  status: string;
  trialEndsAt: string | null;
  renewalDate: string | null;
  alertType:
    | "trial_3d"
    | "trial_7d"
    | "expiring_7d"
    | "past_due"
    | "cancelled"
    | "renewal_email_needed";
};

export type FounderRenewalsData = {
  trialsEnding3Days: FounderRenewalAlert[];
  trialsEnding7Days: FounderRenewalAlert[];
  expiring7Days: FounderRenewalAlert[];
  pastDue: FounderRenewalAlert[];
  cancelled: FounderRenewalAlert[];
  renewalEmailNeeded: FounderRenewalAlert[];
};

export type FounderEmailEventRow = {
  id: string;
  type: "invoice" | "reminder";
  status: string;
  recipientEmail: string | null;
  subject: string | null;
  workspaceId: string | null;
  createdAt: string;
};

export type FounderEmailOpsData = {
  sentToday: number;
  sentThisMonth: number;
  failedCount: number;
  invoiceEmailsSent: number;
  reminderEmailsSent: number;
  recentEvents: FounderEmailEventRow[];
};

export type FounderProductUsageData = {
  invoicesCreatedCount: number;
  remindersSentCount: number;
  clientsCreatedCount: number;
  paymentsRecordedCount: number;
  activeWorkspaces30d: number;
  activeUsers30d: number;
};

export type FounderNotificationRow = {
  id: string;
  type: string;
  title: string;
  description: string;
  createdAt: string;
  href?: string;
};

export type FounderNotificationsData = {
  notifications: FounderNotificationRow[];
};

export type FounderSettingsData = {
  paymentProvider: string;
  billingMode: string;
  emergencyEmailsEnabled: boolean;
  adminBootstrapAvailable: boolean;
};

const REVENUE_DISCLAIMER =
  "Estimated revenue based on assigned plans. Payment provider not connected yet.";

export const SUBSCRIPTION_FALLBACK_BANNER =
  "Subscription tracking table is not installed yet. Using workspace_plans fallback.";

type WorkspaceSubscriptionRow = {
  workspace_id: string;
  status: string;
  plan: string;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  current_period_starts_at: string | null;
  current_period_ends_at: string | null;
};

function startOfTodayLocal() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfMonthLocal() {
  const date = new Date();
  date.setDate(1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function startOfYearLocal() {
  const date = new Date();
  date.setMonth(0, 1);
  date.setHours(0, 0, 0, 0);
  return date;
}

function daysAgoLocal(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date;
}

function isSameLocalDay(dateValue: string, dayStart: Date) {
  const date = new Date(dateValue);
  return (
    date.getFullYear() === dayStart.getFullYear() &&
    date.getMonth() === dayStart.getMonth() &&
    date.getDate() === dayStart.getDate()
  );
}

function isOnOrAfter(dateValue: string, boundary: Date) {
  return Date.parse(dateValue) >= boundary.getTime();
}

function isBefore(dateValue: string, boundary: Date) {
  return Date.parse(dateValue) < boundary.getTime();
}

function getMonthlyPlanValue(plan: WorkspacePlan): number {
  return getPlanDefinition(plan).monthlyPrice ?? 0;
}

const loadCorePlatformData = cache(async function loadCorePlatformData() {
  await assertAdmin();
  const admin = supabaseAdmin();

  const [authUsers, workspacesResult, plansResult, ownersResult] =
    await Promise.all([
      import("@/lib/admin/requireAdmin").then((m) =>
        m.listAllAuthUsersForAdmin()
      ),
      admin
        .from("workspaces")
        .select("id, name, created_at")
        .order("created_at", { ascending: false }),
      admin.from("workspace_plans").select("workspace_id, plan"),
      admin.from("workspace_members").select("workspace_id, user_id, role"),
    ]);

  if (workspacesResult.error) {
    throw new Error(`Failed to load workspaces: ${workspacesResult.error.message}`);
  }
  if (plansResult.error) {
    throw new Error(`Failed to load workspace plans: ${plansResult.error.message}`);
  }
  if (ownersResult.error) {
    throw new Error(`Failed to load workspace members: ${ownersResult.error.message}`);
  }

  let subscriptionsTableAvailable = true;
  let subscriptionRows: WorkspaceSubscriptionRow[] = [];
  const subscriptionsResult = await admin
    .from("workspace_subscriptions")
    .select("*");

  if (subscriptionsResult.error) {
    if (isPostgrestMissingTableError(subscriptionsResult.error)) {
      subscriptionsTableAvailable = false;
    } else {
      throw new Error(
        `Failed to load subscriptions: ${subscriptionsResult.error.message}`
      );
    }
  } else {
    subscriptionRows = (subscriptionsResult.data ??
      []) as WorkspaceSubscriptionRow[];
  }

  const workspaces = workspacesResult.data ?? [];
  const planByWorkspace = new Map<string, WorkspacePlan>();
  for (const row of plansResult.data ?? []) {
    planByWorkspace.set(
      row.workspace_id,
      isWorkspacePlan(row.plan) ? row.plan : "free"
    );
  }
  for (const ws of workspaces) {
    if (!planByWorkspace.has(ws.id)) {
      planByWorkspace.set(ws.id, "free");
    }
  }

  const subscriptionByWorkspace = new Map(
    subscriptionRows.map((row) => [row.workspace_id, row])
  );

  const userEmailById = new Map(authUsers.map((u) => [u.id, u.email]));
  const lastSignInById = new Map(authUsers.map((u) => [u.id, u.last_sign_in_at]));

  const ownerByWorkspace = new Map<
    string,
    { email: string | null; lastSignInAt: string | null; userId: string }
  >();
  for (const member of ownersResult.data ?? []) {
    if (member.role !== "owner") continue;
    if (ownerByWorkspace.has(member.workspace_id)) continue;
    ownerByWorkspace.set(member.workspace_id, {
      email: userEmailById.get(member.user_id) ?? null,
      lastSignInAt: lastSignInById.get(member.user_id) ?? null,
      userId: member.user_id,
    });
  }

  const workspaceCountByUser = new Map<string, number>();
  for (const member of ownersResult.data ?? []) {
    workspaceCountByUser.set(
      member.user_id,
      (workspaceCountByUser.get(member.user_id) ?? 0) + 1
    );
  }

  return {
    authUsers,
    workspaces,
    planByWorkspace,
    subscriptionByWorkspace,
    subscriptionsTableAvailable,
    ownerByWorkspace,
    workspaceCountByUser,
  };
});

export async function getSubscriptionFallbackBanner(): Promise<string | null> {
  const core = await loadCorePlatformData();
  return core.subscriptionsTableAvailable ? null : SUBSCRIPTION_FALLBACK_BANNER;
}

export async function getFounderOverviewData(): Promise<FounderOverviewData> {
  const core = await loadCorePlatformData();
  const todayStart = startOfTodayLocal();
  const monthStart = startOfMonthLocal();
  const yearStart = startOfYearLocal();
  const active30Start = daysAgoLocal(30);

  let freeCount = 0;
  let starterCount = 0;
  let proCount = 0;
  let trialWorkspaces = 0;
  let churnedWorkspaces = 0;
  let activeWorkspaces30d = 0;

  for (const ws of core.workspaces) {
    const plan = core.planByWorkspace.get(ws.id) ?? "free";
    if (plan === "free") freeCount += 1;
    if (plan === "starter") starterCount += 1;
    if (plan === "pro") proCount += 1;

    if (core.subscriptionsTableAvailable) {
      const sub = core.subscriptionByWorkspace.get(ws.id);
      if (sub?.status === "trial") trialWorkspaces += 1;
      if (sub?.status === "cancelled" || sub?.status === "expired") {
        churnedWorkspaces += 1;
      }
    } else if (plan === "free") {
      trialWorkspaces += 1;
    }

    const owner = core.ownerByWorkspace.get(ws.id);
    const ownerActive =
      owner?.lastSignInAt && isOnOrAfter(owner.lastSignInAt, active30Start);
    const createdRecently = isOnOrAfter(ws.created_at, active30Start);
    if (ownerActive || createdRecently) {
      activeWorkspaces30d += 1;
    }
  }

  const paidSubscribers = starterCount + proCount;
  const estimatedMrr = starterCount * STARTER_MRR + proCount * PRO_MRR;
  const estimatedArr = estimatedMrr * 12;
  const conversionRate =
    core.workspaces.length > 0 ? paidSubscribers / core.workspaces.length : 0;

  return {
    totalUsers: core.authUsers.length,
    newUsersToday: core.authUsers.filter(
      (u) => u.created_at && isSameLocalDay(u.created_at, todayStart)
    ).length,
    newUsersThisMonth: core.authUsers.filter(
      (u) => u.created_at && isOnOrAfter(u.created_at, monthStart)
    ).length,
    newUsersThisYear: core.authUsers.filter(
      (u) => u.created_at && isOnOrAfter(u.created_at, yearStart)
    ).length,
    totalWorkspaces: core.workspaces.length,
    activeWorkspaces30d,
    trialWorkspaces,
    paidSubscribers,
    estimatedMrr,
    estimatedArr,
    conversionRate,
    churnedWorkspaces,
    revenueDisclaimer: REVENUE_DISCLAIMER,
  };
}

export async function getFounderUsersData(): Promise<FounderUserRow[]> {
  const core = await loadCorePlatformData();
  return core.authUsers
    .map((user) => ({
      id: user.id,
      email: user.email,
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at,
      workspaceCount: core.workspaceCountByUser.get(user.id) ?? 0,
    }))
    .sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? ""));
}

export async function getFounderSubscribersData(): Promise<FounderSubscriberRow[]> {
  const core = await loadCorePlatformData();
  const rows: FounderSubscriberRow[] = [];

  for (const ws of core.workspaces) {
    const plan = core.planByWorkspace.get(ws.id) ?? "free";
    const sub = core.subscriptionByWorkspace.get(ws.id);
    const owner = core.ownerByWorkspace.get(ws.id);
    const monthly = getMonthlyPlanValue(plan);

    rows.push({
      userEmail: owner?.email ?? null,
      workspaceName: ws.name,
      workspaceId: ws.id,
      plan,
      subscriptionStatus: core.subscriptionsTableAvailable
        ? sub?.status ?? (plan === "free" ? "trial" : "active")
        : "manual",
      trialStartsAt: core.subscriptionsTableAvailable
        ? sub?.trial_starts_at ?? null
        : null,
      trialEndsAt: core.subscriptionsTableAvailable
        ? sub?.trial_ends_at ?? null
        : null,
      renewalDate: core.subscriptionsTableAvailable
        ? sub?.current_period_ends_at ?? null
        : null,
      estimatedMonthlyValue: monthly,
      estimatedYearlyValue: monthly * 12,
      workspaceCreatedAt: ws.created_at,
      lastSignInAt: owner?.lastSignInAt ?? null,
    });
  }

  return rows.sort(
    (a, b) => Date.parse(b.workspaceCreatedAt) - Date.parse(a.workspaceCreatedAt)
  );
}

export async function getFounderRevenueData(): Promise<FounderRevenueData> {
  const core = await loadCorePlatformData();
  const todayStart = startOfTodayLocal();
  const monthStart = startOfMonthLocal();
  const yearStart = startOfYearLocal();

  let freeCount = 0;
  let starterCount = 0;
  let proCount = 0;
  let newMrrToday = 0;
  let newMrrThisMonth = 0;
  let newMrrThisYear = 0;

  for (const ws of core.workspaces) {
    const plan = core.planByWorkspace.get(ws.id) ?? "free";
    const monthly = getMonthlyPlanValue(plan);
    if (plan === "free") freeCount += 1;
    if (plan === "starter") starterCount += 1;
    if (plan === "pro") proCount += 1;

    if (monthly > 0) {
      if (isSameLocalDay(ws.created_at, todayStart)) newMrrToday += monthly;
      if (isOnOrAfter(ws.created_at, monthStart)) newMrrThisMonth += monthly;
      if (isOnOrAfter(ws.created_at, yearStart)) newMrrThisYear += monthly;
    }
  }

  const paidSubscribers = starterCount + proCount;
  const estimatedMrr = starterCount * STARTER_MRR + proCount * PRO_MRR;
  const estimatedArr = estimatedMrr * 12;
  const arpu = paidSubscribers > 0 ? estimatedMrr / paidSubscribers : 0;
  const freeToPaidConversion =
    core.workspaces.length > 0 ? paidSubscribers / core.workspaces.length : 0;

  return {
    estimatedMrr,
    estimatedArr,
    mrrByPlan: [
      { plan: "free", count: freeCount, mrr: 0 },
      { plan: "starter", count: starterCount, mrr: starterCount * STARTER_MRR },
      { plan: "pro", count: proCount, mrr: proCount * PRO_MRR },
    ],
    newMrrToday,
    newMrrThisMonth,
    newMrrThisYear,
    arpu,
    freeToPaidConversion,
    revenueDisclaimer: REVENUE_DISCLAIMER,
  };
}

function buildRenewalAlert(
  ws: { id: string; name: string },
  core: Awaited<ReturnType<typeof loadCorePlatformData>>,
  alertType: FounderRenewalAlert["alertType"]
): FounderRenewalAlert {
  const plan = core.planByWorkspace.get(ws.id) ?? "free";
  const sub = core.subscriptionByWorkspace.get(ws.id);
  const owner = core.ownerByWorkspace.get(ws.id);
  return {
    workspaceId: ws.id,
    workspaceName: ws.name,
    ownerEmail: owner?.email ?? null,
    plan,
    status: sub?.status ?? "trial",
    trialEndsAt: sub?.trial_ends_at ?? null,
    renewalDate: sub?.current_period_ends_at ?? null,
    alertType,
  };
}

export async function getFounderRenewalsData(): Promise<FounderRenewalsData> {
  const core = await loadCorePlatformData();

  if (!core.subscriptionsTableAvailable) {
    return {
      trialsEnding3Days: [],
      trialsEnding7Days: [],
      expiring7Days: [],
      pastDue: [],
      cancelled: [],
      renewalEmailNeeded: [],
    };
  }

  const now = new Date();
  const in3Days = new Date(now);
  in3Days.setDate(in3Days.getDate() + 3);
  const in7Days = new Date(now);
  in7Days.setDate(in7Days.getDate() + 7);

  const trialsEnding3Days: FounderRenewalAlert[] = [];
  const trialsEnding7Days: FounderRenewalAlert[] = [];
  const expiring7Days: FounderRenewalAlert[] = [];
  const pastDue: FounderRenewalAlert[] = [];
  const cancelled: FounderRenewalAlert[] = [];
  const renewalEmailNeeded: FounderRenewalAlert[] = [];

  for (const ws of core.workspaces) {
    const sub = core.subscriptionByWorkspace.get(ws.id);
    if (!sub) continue;

    if (sub.status === "past_due") {
      pastDue.push(buildRenewalAlert(ws, core, "past_due"));
    }
    if (sub.status === "cancelled") {
      cancelled.push(buildRenewalAlert(ws, core, "cancelled"));
    }

    if (sub.trial_ends_at) {
      const trialEnd = Date.parse(sub.trial_ends_at);
      if (trialEnd >= now.getTime() && trialEnd <= in3Days.getTime()) {
        trialsEnding3Days.push(buildRenewalAlert(ws, core, "trial_3d"));
        renewalEmailNeeded.push(buildRenewalAlert(ws, core, "renewal_email_needed"));
      } else if (trialEnd > in3Days.getTime() && trialEnd <= in7Days.getTime()) {
        trialsEnding7Days.push(buildRenewalAlert(ws, core, "trial_7d"));
        renewalEmailNeeded.push(buildRenewalAlert(ws, core, "renewal_email_needed"));
      }
    }

    if (sub.current_period_ends_at && sub.status === "active") {
      const periodEnd = Date.parse(sub.current_period_ends_at);
      if (periodEnd >= now.getTime() && periodEnd <= in7Days.getTime()) {
        expiring7Days.push(buildRenewalAlert(ws, core, "expiring_7d"));
        renewalEmailNeeded.push(buildRenewalAlert(ws, core, "renewal_email_needed"));
      }
    }
  }

  return {
    trialsEnding3Days,
    trialsEnding7Days,
    expiring7Days,
    pastDue,
    cancelled,
    renewalEmailNeeded,
  };
}

export async function getFounderEmailOpsData(): Promise<FounderEmailOpsData> {
  await assertAdmin();
  const admin = supabaseAdmin();
  const todayStart = startOfTodayLocal();
  const monthStart = startOfMonthLocal();

  const [invoiceLogs, reminderLogs] = await Promise.all([
    admin
      .from("invoice_delivery_logs")
      .select("id, workspace_id, recipient_email, subject, status, created_at")
      .order("created_at", { ascending: false })
      .limit(100),
    admin
      .from("reminders")
      .select("id, workspace_id, status, subject, created_at, sent_at")
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const invoiceRows = invoiceLogs.data ?? [];
  const reminderRows = reminderLogs.data ?? [];

  const isSent = (status: string | null) =>
    status === "sent" || status === "delivered";

  const sentToday =
    invoiceRows.filter(
      (r) => isSent(r.status) && isSameLocalDay(r.created_at, todayStart)
    ).length +
    reminderRows.filter(
      (r) =>
        isSent(r.status) &&
        r.sent_at &&
        isSameLocalDay(r.sent_at, todayStart)
    ).length;

  const sentThisMonth =
    invoiceRows.filter(
      (r) => isSent(r.status) && isOnOrAfter(r.created_at, monthStart)
    ).length +
    reminderRows.filter(
      (r) =>
        isSent(r.status) &&
        r.sent_at &&
        isOnOrAfter(r.sent_at, monthStart)
    ).length;

  const failedCount =
    invoiceRows.filter((r) => r.status === "failed").length +
    reminderRows.filter((r) => r.status === "failed").length;

  const invoiceEmailsSent = invoiceRows.filter((r) => isSent(r.status)).length;
  const reminderEmailsSent = reminderRows.filter((r) => isSent(r.status)).length;

  const recentEvents: FounderEmailEventRow[] = [
    ...invoiceRows.slice(0, 20).map((row) => ({
      id: row.id,
      type: "invoice" as const,
      status: row.status,
      recipientEmail: row.recipient_email,
      subject: row.subject,
      workspaceId: row.workspace_id,
      createdAt: row.created_at,
    })),
    ...reminderRows.slice(0, 20).map((row) => ({
      id: row.id,
      type: "reminder" as const,
      status: row.status,
      recipientEmail: null,
      subject: row.subject,
      workspaceId: row.workspace_id,
      createdAt: row.sent_at ?? row.created_at,
    })),
  ]
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, 20);

  return {
    sentToday,
    sentThisMonth,
    failedCount,
    invoiceEmailsSent,
    reminderEmailsSent,
    recentEvents,
  };
}

export async function getFounderProductUsageData(): Promise<FounderProductUsageData> {
  await assertAdmin();
  const admin = supabaseAdmin();
  const active30Start = daysAgoLocal(30);

  const [
    invoicesCount,
    remindersCount,
    clientsCount,
    paymentsCount,
    core,
  ] = await Promise.all([
    admin
      .from("invoices")
      .select("*", { count: "exact", head: true })
      .is("archived_at", null),
    admin
      .from("reminders")
      .select("*", { count: "exact", head: true })
      .eq("status", "sent"),
    admin
      .from("clients")
      .select("*", { count: "exact", head: true })
      .is("archived_at", null),
    admin.from("payments").select("*", { count: "exact", head: true }),
    loadCorePlatformData(),
  ]);

  let activeWorkspaces30d = 0;
  let activeUsers30d = 0;

  for (const ws of core.workspaces) {
    const owner = core.ownerByWorkspace.get(ws.id);
    if (
      owner?.lastSignInAt &&
      isOnOrAfter(owner.lastSignInAt, active30Start)
    ) {
      activeWorkspaces30d += 1;
    }
  }

  for (const user of core.authUsers) {
    if (user.last_sign_in_at && isOnOrAfter(user.last_sign_in_at, active30Start)) {
      activeUsers30d += 1;
    }
  }

  return {
    invoicesCreatedCount: invoicesCount.count ?? 0,
    remindersSentCount: remindersCount.count ?? 0,
    clientsCreatedCount: clientsCount.count ?? 0,
    paymentsRecordedCount: paymentsCount.count ?? 0,
    activeWorkspaces30d,
    activeUsers30d,
  };
}

export async function getFounderNotificationsData(): Promise<FounderNotificationsData> {
  const [renewals, overview, emailOps, core] = await Promise.all([
    getFounderRenewalsData(),
    getFounderOverviewData(),
    getFounderEmailOpsData(),
    loadCorePlatformData(),
  ]);

  const notifications: FounderNotificationRow[] = [];
  const todayStart = startOfTodayLocal();

  for (const alert of renewals.trialsEnding3Days) {
    notifications.push({
      id: `trial-3d-${alert.workspaceId}`,
      type: "trial_ending",
      title: "Trial ending in 3 days",
      description: `${alert.workspaceName} (${alert.ownerEmail ?? "no owner email"})`,
      createdAt: new Date().toISOString(),
      href: "/admin/renewals",
    });
  }

  for (const alert of renewals.expiring7Days) {
    notifications.push({
      id: `expiring-${alert.workspaceId}`,
      type: "subscription_expiring",
      title: "Subscription expiring soon",
      description: `${alert.workspaceName} renews ${alert.renewalDate ?? "soon"}`,
      createdAt: new Date().toISOString(),
      href: "/admin/renewals",
    });
  }

  for (const alert of renewals.pastDue) {
    notifications.push({
      id: `past-due-${alert.workspaceId}`,
      type: "past_due",
      title: "Past due workspace",
      description: alert.workspaceName,
      createdAt: new Date().toISOString(),
      href: "/admin/renewals",
    });
  }

  if (emailOps.failedCount > 0) {
    notifications.push({
      id: "failed-emails",
      type: "email_failure",
      title: "Failed email sends detected",
      description: `${emailOps.failedCount} failed sends in recent logs`,
      createdAt: new Date().toISOString(),
      href: "/admin/email-ops",
    });
  }

  const newSignupsToday = core.authUsers.filter(
    (u) => u.created_at && isSameLocalDay(u.created_at, todayStart)
  );
  for (const user of newSignupsToday.slice(0, 5)) {
    notifications.push({
      id: `signup-${user.id}`,
      type: "new_signup",
      title: "New signup",
      description: user.email ?? user.id,
      createdAt: user.created_at ?? new Date().toISOString(),
      href: "/admin/users",
    });
  }

  if (overview.newUsersThisMonth > 0 && overview.paidSubscribers > 0) {
    notifications.push({
      id: "paid-subscribers",
      type: "paid_subscriber",
      title: "Paid subscribers active",
      description: `${overview.paidSubscribers} workspaces on Starter or Pro`,
      createdAt: new Date().toISOString(),
      href: "/admin/subscribers",
    });
  }

  notifications.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

  return { notifications };
}

export async function getFounderSettingsData(
  bootstrapAllowed: boolean
): Promise<FounderSettingsData> {
  return {
    paymentProvider: "Not connected",
    billingMode: "Manual plan assignment",
    emergencyEmailsEnabled: process.env.ADMIN_EMERGENCY_EMAILS_ENABLED === "true",
    adminBootstrapAvailable: bootstrapAllowed,
  };
}

/** @deprecated Use getFounderOverviewData and page-specific loaders instead. */
export async function getAdminDashboardData() {
  const overview = await getFounderOverviewData();
  const subscribers = await getFounderSubscribersData();
  const revenue = await getFounderRevenueData();
  const productUsage = await getFounderProductUsageData();
  return { overview, subscribers, revenue, productUsage };
}

export type AdminDashboardData = Awaited<ReturnType<typeof getAdminDashboardData>>;
