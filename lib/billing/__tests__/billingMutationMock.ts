import type { SupabaseClient } from "@supabase/supabase-js";

import { getPlanStorageLimits, type WorkspacePlan } from "@/lib/billing/plans";

type PlanRow = {
  workspace_id: string;
  plan: string;
  invoice_limit_monthly: number | null;
  client_limit: number | null;
};

type SubscriptionRow = {
  workspace_id: string;
  plan: string;
  status: string;
  payment_provider?: string;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  current_period_starts_at: string | null;
  current_period_ends_at: string | null;
  updated_at?: string;
};

type TemplateRow = {
  id: string;
  workspace_id: string;
  code: string;
};

type RuleRow = {
  id: string;
  workspace_id: string;
  template_id: string;
  trigger_type: string;
  offset_days: number;
  for_status: string;
  is_enabled: boolean;
};

type WorkspaceRow = {
  id: string;
};

export type BillingMockState = {
  workspaces: WorkspaceRow[];
  plans: PlanRow[];
  subscriptions: SubscriptionRow[];
  templates: TemplateRow[];
  rules: RuleRow[];
  planUpsertShouldFail?: boolean;
  subscriptionUpsertShouldFail?: boolean;
  subscriptionUpsertNoOp?: boolean;
  atomicRpcShouldFail?: boolean;
  atomicRpcMissingWorkspace?: boolean;
  atomicRpcSnapshotOnly?: boolean;
  atomicRpcInvalidSnapshot?: boolean;
  nextTemplateId: number;
  nextRuleId: number;
};

export function createBillingMockState(): BillingMockState {
  return {
    workspaces: [],
    plans: [],
    subscriptions: [],
    templates: [],
    rules: [],
    nextTemplateId: 1,
    nextRuleId: 1,
  };
}

function applyFilters<T extends Record<string, unknown>>(
  rows: T[],
  filters: Array<(row: T) => boolean>
): T[] {
  return rows.filter((row) => filters.every((filter) => filter(row)));
}

class BillingQueryBuilder {
  private table: string;
  private state: BillingMockState;
  private filters: Array<(row: Record<string, unknown>) => boolean> = [];
  private pendingInsert: Record<string, unknown> | null = null;
  private pendingUpdate: Record<string, unknown> | null = null;

  constructor(table: string, state: BillingMockState) {
    this.table = table;
    this.state = state;
  }

  select(_columns: string) {
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  insert(row: Record<string, unknown> | Record<string, unknown>[]) {
    this.pendingInsert = Array.isArray(row) ? row[0]! : row;
    return this;
  }

  upsert(row: Record<string, unknown>) {
    this.pendingInsert = row;
    return this;
  }

  update(row: Record<string, unknown>) {
    this.pendingUpdate = row;
    return this;
  }

  maybeSingle() {
    if (this.pendingInsert) {
      const result = this.performWrite();
      this.pendingInsert = null;
      return Promise.resolve(result);
    }
    if (this.pendingUpdate) {
      const result = this.performUpdate();
      this.pendingUpdate = null;
      return Promise.resolve(result);
    }

    const rows = this.getRows();
    return Promise.resolve({ data: rows[0] ?? null, error: null });
  }

  single() {
    return this.maybeSingle();
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    if (this.pendingInsert) {
      const result = this.performWrite();
      this.pendingInsert = null;
      return Promise.resolve({ data: result.data, error: result.error }).then(
        onfulfilled,
        onrejected
      );
    }

    if (this.pendingUpdate) {
      const result = this.performUpdate();
      this.pendingUpdate = null;
      return Promise.resolve({ data: result.data, error: result.error }).then(
        onfulfilled,
        onrejected
      );
    }

    const rows = this.getRows();
    return Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected);
  }

  private getRows(): Record<string, unknown>[] {
    switch (this.table) {
      case "workspace_plans":
        return applyFilters(this.state.plans, this.filters);
      case "workspace_subscriptions":
        return applyFilters(this.state.subscriptions, this.filters);
      case "workspaces":
        return applyFilters(this.state.workspaces, this.filters);
      case "reminder_templates":
        return applyFilters(this.state.templates, this.filters);
      case "reminder_rules":
        return applyFilters(this.state.rules, this.filters);
      default:
        return [];
    }
  }

  private performWrite(): { data: Record<string, unknown> | null; error: { message: string; code?: string } | null } {
    const row = this.pendingInsert;
    if (!row) {
      return { data: null, error: { message: "no row" } };
    }

    if (this.table === "workspace_plans") {
      if (this.state.planUpsertShouldFail) {
        return { data: null, error: { message: "plan upsert failed", code: "42501" } };
      }
      const workspaceId = String(row.workspace_id);
      const limits = getPlanStorageLimits(row.plan as WorkspacePlan);
      const existingIndex = this.state.plans.findIndex(
        (entry) => entry.workspace_id === workspaceId
      );
      const next: PlanRow = {
        workspace_id: workspaceId,
        plan: String(row.plan),
        invoice_limit_monthly: limits.invoice_limit_monthly,
        client_limit: limits.client_limit,
      };
      if (existingIndex >= 0) {
        this.state.plans[existingIndex] = next;
      } else {
        this.state.plans.push(next);
      }
      return { data: next, error: null };
    }

    if (this.table === "workspace_subscriptions") {
      if (this.state.subscriptionUpsertShouldFail) {
        return { data: null, error: { message: "subscription upsert failed", code: "42501" } };
      }
      if (this.state.subscriptionUpsertNoOp) {
        return { data: null, error: null };
      }
      const workspaceId = String(row.workspace_id);
      const next: SubscriptionRow = {
        workspace_id: workspaceId,
        plan: String(row.plan),
        status: String(row.status),
        payment_provider: row.payment_provider ? String(row.payment_provider) : "manual",
        trial_starts_at: (row.trial_starts_at as string | null) ?? null,
        trial_ends_at: (row.trial_ends_at as string | null) ?? null,
        current_period_starts_at: (row.current_period_starts_at as string | null) ?? null,
        current_period_ends_at: (row.current_period_ends_at as string | null) ?? null,
        updated_at: row.updated_at ? String(row.updated_at) : new Date().toISOString(),
      };
      const existingIndex = this.state.subscriptions.findIndex(
        (entry) => entry.workspace_id === workspaceId
      );
      if (existingIndex >= 0) {
        this.state.subscriptions[existingIndex] = next;
      } else {
        this.state.subscriptions.push(next);
      }
      return { data: next, error: null };
    }

    if (this.table === "reminder_templates") {
      const workspaceId = String(row.workspace_id);
      const code = String(row.code);
      const existing = this.state.templates.find(
        (entry) => entry.workspace_id === workspaceId && entry.code === code
      );
      if (existing) {
        return { data: existing, error: null };
      }
      const inserted: TemplateRow = {
        id: `tmpl-${this.state.nextTemplateId++}`,
        workspace_id: workspaceId,
        code,
      };
      this.state.templates.push(inserted);
      return { data: inserted, error: null };
    }

    if (this.table === "reminder_rules") {
      const inserted: RuleRow = {
        id: `rule-${this.state.nextRuleId++}`,
        workspace_id: String(row.workspace_id),
        template_id: String(row.template_id),
        trigger_type: String(row.trigger_type),
        offset_days: Number(row.offset_days),
        for_status: String(row.for_status),
        is_enabled: Boolean(row.is_enabled),
      };
      this.state.rules.push(inserted);
      return { data: inserted, error: null };
    }

    return { data: row, error: null };
  }

  private performUpdate(): { data: Record<string, unknown> | null; error: { message: string } | null } {
    const patch = this.pendingUpdate ?? {};
    const rows = this.getRows();
    if (rows.length === 0) {
      return { data: null, error: { message: "not found" } };
    }
    const target = rows[0]!;
    Object.assign(target, patch);
    return { data: target, error: null };
  }
}

const VALID_PLANS = new Set(["free", "starter", "pro", "business"]);
const VALID_STATUSES = new Set(["trial", "active", "past_due", "cancelled", "expired"]);

function executeAtomicRpc(
  state: BillingMockState,
  params: Record<string, unknown>
):
  | { data: Record<string, unknown>; error: null }
  | { data: null; error: { message: string; code?: string } } {
  const workspaceId = String(params.p_workspace_id ?? "");
  const targetPlan = String(params.p_target_plan ?? "");
  const subscriptionPlan = String(params.p_subscription_plan ?? "");
  const subscriptionStatus = String(params.p_subscription_status ?? "");

  if (state.atomicRpcShouldFail) {
    return { data: null, error: { message: "atomic rpc failed", code: "P0001" } };
  }

  if (
    !VALID_PLANS.has(targetPlan) ||
    !VALID_PLANS.has(subscriptionPlan) ||
    !VALID_STATUSES.has(subscriptionStatus)
  ) {
    return { data: null, error: { message: "invalid plan or status", code: "22023" } };
  }

  if (
    state.atomicRpcMissingWorkspace ||
    !state.workspaces.some((workspace) => workspace.id === workspaceId)
  ) {
    return { data: null, error: { message: "workspace not found", code: "P0002" } };
  }

  const nowIso = new Date().toISOString();
  const planRow: PlanRow = {
    workspace_id: workspaceId,
    plan: targetPlan,
    invoice_limit_monthly:
      params.p_invoice_limit_monthly === null || params.p_invoice_limit_monthly === undefined
        ? null
        : Number(params.p_invoice_limit_monthly),
    client_limit:
      params.p_client_limit === null || params.p_client_limit === undefined
        ? null
        : Number(params.p_client_limit),
  };

  const subscriptionRow: SubscriptionRow = {
    workspace_id: workspaceId,
    plan: subscriptionPlan,
    status: subscriptionStatus,
    payment_provider: String(params.p_payment_provider ?? "manual"),
    trial_starts_at: (params.p_trial_starts_at as string | null) ?? null,
    trial_ends_at: (params.p_trial_ends_at as string | null) ?? null,
    current_period_starts_at: (params.p_current_period_starts_at as string | null) ?? null,
    current_period_ends_at: (params.p_current_period_ends_at as string | null) ?? null,
    updated_at: nowIso,
  };

  if (!state.atomicRpcSnapshotOnly) {
    const planIndex = state.plans.findIndex((entry) => entry.workspace_id === workspaceId);
    if (planIndex >= 0) {
      state.plans[planIndex] = planRow;
    } else {
      state.plans.push(planRow);
    }

    const subscriptionIndex = state.subscriptions.findIndex(
      (entry) => entry.workspace_id === workspaceId
    );
    if (subscriptionIndex >= 0) {
      state.subscriptions[subscriptionIndex] = subscriptionRow;
    } else {
      state.subscriptions.push(subscriptionRow);
    }
  }

  const snapshot = {
    workspace_id: workspaceId,
    stored_plan: state.atomicRpcInvalidSnapshot ? "free" : targetPlan,
    subscription_plan: subscriptionPlan,
    subscription_status: subscriptionStatus,
    payment_provider: subscriptionRow.payment_provider,
    trial_starts_at: subscriptionRow.trial_starts_at,
    trial_ends_at: subscriptionRow.trial_ends_at,
    current_period_starts_at: subscriptionRow.current_period_starts_at,
    current_period_ends_at: subscriptionRow.current_period_ends_at,
    cancel_at_period_end: Boolean(params.p_cancel_at_period_end ?? false),
    plan_updated_at: nowIso,
    subscription_updated_at: nowIso,
  };

  return { data: snapshot, error: null };
}

export function createBillingMockAdmin(state: BillingMockState): SupabaseClient {
  return {
    from(table: string) {
      return new BillingQueryBuilder(table, state) as unknown as ReturnType<
        SupabaseClient["from"]
      >;
    },
    rpc(fn: string, params: Record<string, unknown>) {
      if (fn !== "rpc_change_workspace_plan_atomic") {
        return Promise.resolve({
          data: null,
          error: { message: `unexpected rpc: ${fn}`, code: "42883" },
        });
      }
      const result = executeAtomicRpc(state, params);
      return Promise.resolve(result);
    },
  } as unknown as SupabaseClient;
}

export function seedWorkspace(state: BillingMockState, workspaceId: string): void {
  if (!state.workspaces.some((workspace) => workspace.id === workspaceId)) {
    state.workspaces.push({ id: workspaceId });
  }
}

export function seedPlan(
  state: BillingMockState,
  workspaceId: string,
  plan: WorkspacePlan
): void {
  seedWorkspace(state, workspaceId);
  const limits = getPlanStorageLimits(plan);
  state.plans.push({
    workspace_id: workspaceId,
    plan,
    invoice_limit_monthly: limits.invoice_limit_monthly,
    client_limit: limits.client_limit,
  });
}

export function seedSubscription(
  state: BillingMockState,
  workspaceId: string,
  row: Omit<SubscriptionRow, "workspace_id">
): void {
  state.subscriptions.push({
    workspace_id: workspaceId,
    ...row,
  });
}
