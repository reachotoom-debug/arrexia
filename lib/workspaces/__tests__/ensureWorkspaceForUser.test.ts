import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ORGANIZATION_BOOTSTRAP_COLUMNS,
  WorkspaceBootstrapError,
  bootstrapWorkspaceForUser,
  buildOrganizationInsertPayload,
  ensureDefaultWorkspacePlan,
  ensureOwnerMembership,
  ensureStandaloneTrialIfNeeded,
  ensureWorkspaceSettings,
  loadExistingWorkspaceForUser,
  maybePromoteFreePlanToPublicTrial,
  type WorkspaceBootstrapAdmin,
} from "../ensureWorkspaceForUser";
import {
  MS_PER_DAY,
  TRIAL_DURATION_DAYS,
} from "@/lib/billing/trialConfig";
import type { SignupMarketingPlanIntent } from "@/lib/billing/publicTrialPlan";

type MembershipRow = {
  workspace_id: string;
  user_id: string;
  role: string;
  created_at: string;
};

type OrganizationRow = {
  id: string;
  name: string;
  created_at: string;
};

type WorkspaceRow = {
  id: string;
  name: string;
  organization_id: string | null;
  created_at: string;
  trial_consumed_at?: string | null;
};

type SettingsRow = {
  workspace_id: string;
  default_currency: string;
  auto_send_reminders?: boolean;
};

type PlanRow = {
  workspace_id: string;
  plan: string;
  invoice_limit_monthly: number;
  client_limit: number;
};

type EmailSettingsRow = {
  workspace_id: string;
};

type SubscriptionRow = {
  workspace_id: string;
  plan: string;
  status: string;
  trial_starts_at: string | null;
  trial_ends_at: string | null;
  trial_consumed_at?: string | null;
};

type MockState = {
  memberships: MembershipRow[];
  organizations: OrganizationRow[];
  workspaces: WorkspaceRow[];
  settings: SettingsRow[];
  plans: PlanRow[];
  emailSettings: EmailSettingsRow[];
  subscriptions: SubscriptionRow[];
  authUsers: Map<string, { email: string }>;
  insertCounts: {
    organizations: number;
    workspaces: number;
    memberships: number;
    settings: number;
    plans: number;
    emailSettings: number;
    subscriptions: number;
  };
  settingsInsertShouldFail?: boolean;
  planInsertShouldFail?: boolean;
  subscriptionInsertShouldFail?: boolean;
};

function newId(prefix: string, index: number): string {
  return `${prefix}-${index.toString().padStart(4, "0")}-0000-0000-0000-000000000001`;
}

function createMockAdmin(state: MockState): WorkspaceBootstrapAdmin {
  return {
    auth: {
      admin: {
        getUserById: async (userId: string) => {
          const user = state.authUsers.get(userId);
          if (!user) {
            return {
              data: { user: null },
              error: { message: "User not found", code: "user_not_found" },
            };
          }
          return { data: { user: { id: userId, email: user.email } }, error: null };
        },
      },
    },
    from(table: string) {
      return new MockQueryBuilder(table, state) as unknown as ReturnType<
        WorkspaceBootstrapAdmin["from"]
      >;
    },
  } as WorkspaceBootstrapAdmin;
}

class MockQueryBuilder {
  private table: string;
  private state: MockState;
  private filters: Array<(row: Record<string, unknown>) => boolean> = [];
  private orderField: string | null = null;
  private orderAscending = true;
  private limitCount: number | null = null;
  private pendingInsert: Record<string, unknown> | null = null;
  private pendingUpdate: Record<string, unknown> | null = null;
  private headCount = false;
  private isNullFilters: string[] = [];

  constructor(table: string, state: MockState) {
    this.table = table;
    this.state = state;
  }

  select(_columns: string, options?: { count?: string; head?: boolean }) {
    if (options?.count === "exact" && options.head) {
      this.headCount = true;
    }
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderField = column;
    this.orderAscending = options?.ascending ?? true;
    return this;
  }

  limit(count: number) {
    this.limitCount = count;
    return this;
  }

  is(column: string, value: unknown) {
    if (value === null) {
      this.isNullFilters.push(column);
    }
    return this;
  }

  insert(row: Record<string, unknown>) {
    this.pendingInsert = row;
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
    if (this.pendingUpdate) {
      const result = this.performUpdate();
      this.pendingUpdate = null;
      return Promise.resolve({ data: result.data, error: result.error });
    }

    if (this.pendingInsert) {
      const result = this.performInsert();
      this.pendingInsert = null;
      return Promise.resolve({ data: result.data, error: result.error });
    }

    const rows = this.getRows();
    return Promise.resolve({ data: rows[0] ?? null, error: null });
  }

  single() {
    if (this.pendingUpdate) {
      const result = this.performUpdate();
      this.pendingUpdate = null;
      if (result.error || !result.data) {
        return Promise.resolve({
          data: null,
          error: result.error ?? { message: "update returned no row", code: "PGRST116" },
        });
      }
      return Promise.resolve({ data: result.data, error: null });
    }

    if (this.pendingInsert) {
      const result = this.performInsert();
      this.pendingInsert = null;
      if (result.error || !result.data) {
        return Promise.resolve({
          data: null,
          error: result.error ?? { message: "insert returned no row", code: "PGRST116" },
        });
      }
      return Promise.resolve({ data: result.data, error: null });
    }

    const rows = this.getRows();
    if (rows.length !== 1) {
      return Promise.resolve({
        data: null,
        error: { message: "Expected exactly one row", code: "PGRST116" },
      });
    }
    return Promise.resolve({ data: rows[0], error: null });
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    if (this.headCount) {
      const count = this.getRows().length;
      return Promise.resolve({ count, error: null }).then(onfulfilled, onrejected);
    }

    if (this.pendingUpdate) {
      const result = this.performUpdate();
      this.pendingUpdate = null;
      return Promise.resolve({ data: result.data, error: result.error }).then(onfulfilled, onrejected);
    }

    if (this.pendingInsert) {
      const result = this.performInsert();
      this.pendingInsert = null;
      return Promise.resolve({ data: result.data, error: result.error }).then(onfulfilled, onrejected);
    }

    const rows = this.getRows();
    return Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected);
  }

  private getRows(): Record<string, unknown>[] {
    const source = this.getSourceRows();
    let rows = source.filter((row) => this.filters.every((filter) => filter(row)));

    if (this.orderField) {
      rows = [...rows].sort((a, b) => {
        const left = String(a[this.orderField as string] ?? "");
        const right = String(b[this.orderField as string] ?? "");
        const cmp = left.localeCompare(right);
        return this.orderAscending ? cmp : -cmp;
      });
    }

    if (this.limitCount !== null) {
      rows = rows.slice(0, this.limitCount);
    }

    return rows;
  }

  private getSourceRows(): Record<string, unknown>[] {
    switch (this.table) {
      case "workspace_members":
        return this.state.memberships;
      case "organizations":
        return this.state.organizations;
      case "workspaces":
        return this.state.workspaces;
      case "settings":
        return this.state.settings;
      case "workspace_plans":
        return this.state.plans;
      case "workspace_email_settings":
        return this.state.emailSettings;
      case "workspace_subscriptions":
        return this.state.subscriptions;
      default:
        return [];
    }
  }

  private performInsert(): { data: Record<string, unknown> | null; error: { message: string; code: string } | null } {
    const row = this.pendingInsert ?? {};

    switch (this.table) {
      case "organizations": {
        stateInsertCount(this.state, "organizations");
        const org: OrganizationRow = {
          id: newId("org", this.state.organizations.length + 1),
          name: String(row.name),
          created_at: new Date().toISOString(),
        };
        this.state.organizations.push(org);
        return { data: { id: org.id }, error: null };
      }
      case "workspaces": {
        stateInsertCount(this.state, "workspaces");
        const workspace: WorkspaceRow = {
          id: newId("ws", this.state.workspaces.length + 1),
          name: String(row.name),
          organization_id: (row.organization_id as string | null) ?? null,
          created_at: new Date().toISOString(),
          trial_consumed_at: null,
        };
        this.state.workspaces.push(workspace);
        return { data: { id: workspace.id, organization_id: workspace.organization_id }, error: null };
      }
      case "workspace_members": {
        stateInsertCount(this.state, "memberships");
        const duplicate = this.state.memberships.some(
          (membership) =>
            membership.workspace_id === row.workspace_id && membership.user_id === row.user_id
        );
        if (duplicate) {
          return {
            data: null,
            error: { message: "duplicate membership", code: "23505" },
          };
        }
        this.state.memberships.push({
          workspace_id: String(row.workspace_id),
          user_id: String(row.user_id),
          role: String(row.role),
          created_at: new Date().toISOString(),
        });
        return { data: null, error: null };
      }
      case "settings": {
        stateInsertCount(this.state, "settings");
        if (this.state.settingsInsertShouldFail) {
          return {
            data: null,
            error: { message: "settings insert failed", code: "42501" },
          };
        }
        const duplicateSettings = this.state.settings.some(
          (settings) => settings.workspace_id === row.workspace_id
        );
        if (duplicateSettings) {
          return { data: null, error: { message: "duplicate settings", code: "23505" } };
        }
        this.state.settings.push({
          workspace_id: String(row.workspace_id),
          default_currency: String(row.default_currency ?? "USD"),
          auto_send_reminders:
            typeof row.auto_send_reminders === "boolean" ? row.auto_send_reminders : undefined,
        });
        return { data: null, error: null };
      }
      case "workspace_plans": {
        stateInsertCount(this.state, "plans");
        if (this.state.planInsertShouldFail) {
          return {
            data: null,
            error: { message: "plan insert failed", code: "42501" },
          };
        }
        const duplicatePlan = this.state.plans.some(
          (plan) => plan.workspace_id === row.workspace_id
        );
        if (duplicatePlan) {
          return { data: null, error: { message: "duplicate plan", code: "23505" } };
        }
        this.state.plans.push({
          workspace_id: String(row.workspace_id),
          plan: String(row.plan),
          invoice_limit_monthly: Number(row.invoice_limit_monthly),
          client_limit: Number(row.client_limit),
        });
        return { data: null, error: null };
      }
      case "workspace_email_settings": {
        stateInsertCount(this.state, "emailSettings");
        const duplicateEmailSettings = this.state.emailSettings.some(
          (emailSettings) => emailSettings.workspace_id === row.workspace_id
        );
        if (duplicateEmailSettings) {
          return { data: null, error: { message: "duplicate email settings", code: "23505" } };
        }
        this.state.emailSettings.push({
          workspace_id: String(row.workspace_id),
        });
        return { data: null, error: null };
      }
      case "workspace_subscriptions": {
        stateInsertCount(this.state, "subscriptions");
        if (this.state.subscriptionInsertShouldFail) {
          return {
            data: null,
            error: { message: "subscription insert failed", code: "42501" },
          };
        }
        this.state.subscriptions.push({
          workspace_id: String(row.workspace_id),
          plan: String(row.plan),
          status: String(row.status),
          trial_starts_at: (row.trial_starts_at as string | null) ?? null,
          trial_ends_at: (row.trial_ends_at as string | null) ?? null,
          trial_consumed_at: (row.trial_consumed_at as string | null) ?? null,
        });
        return { data: null, error: null };
      }
      default:
        return { data: null, error: { message: `Unknown table ${this.table}`, code: "mock" } };
    }
  }

  private performUpdate(): {
    data: Record<string, unknown> | null;
    error: { message: string; code: string } | null;
  } {
    const patch = this.pendingUpdate ?? {};

    if (this.table === "workspace_plans") {
      const target = this.state.plans.find((plan) =>
        this.filters.every((filter) => filter(plan as unknown as Record<string, unknown>))
      );

      if (!target) {
        return { data: null, error: { message: "plan not found", code: "PGRST116" } };
      }

      if (patch.plan !== undefined) target.plan = String(patch.plan);
      if (patch.invoice_limit_monthly !== undefined) {
        target.invoice_limit_monthly = Number(patch.invoice_limit_monthly);
      }
      if (patch.client_limit !== undefined) {
        target.client_limit = Number(patch.client_limit);
      }

      return { data: { workspace_id: target.workspace_id }, error: null };
    }

    if (this.table === "workspaces") {
      const target = this.state.workspaces.find((workspace) =>
        this.filters.every((filter) => filter(workspace as unknown as Record<string, unknown>))
      );

      if (!target) {
        return { data: null, error: { message: "workspace not found", code: "PGRST116" } };
      }

      for (const column of this.isNullFilters) {
        if ((target as Record<string, unknown>)[column] != null) {
          return { data: null, error: null };
        }
      }

      if (patch.trial_consumed_at !== undefined) {
        target.trial_consumed_at = (patch.trial_consumed_at as string | null) ?? null;
      }

      return { data: { id: target.id }, error: null };
    }

    return { data: null, error: { message: `Unknown update table ${this.table}`, code: "mock" } };
  }
}

function stateInsertCount(state: MockState, key: keyof MockState["insertCounts"]): void {
  state.insertCounts[key] += 1;
}

function createEmptyState(userId: string, email: string): MockState {
  return {
    memberships: [],
    organizations: [],
    workspaces: [],
    settings: [],
    plans: [],
    emailSettings: [],
    subscriptions: [],
    authUsers: new Map([[userId, { email }]]),
    insertCounts: {
      organizations: 0,
      workspaces: 0,
      memberships: 0,
      settings: 0,
      plans: 0,
      emailSettings: 0,
      subscriptions: 0,
    },
  };
}

describe("ensureWorkspaceForUser bootstrap", () => {
  it("Test 1 — returns existing workspace without creating duplicates", async () => {
    const userId = "user-existing";
    const workspaceId = "ws-existing-0000-0000-0000-000000000001";
    const state = createEmptyState(userId, "owner@example.com");
    state.memberships.push({
      workspace_id: workspaceId,
      user_id: userId,
      role: "owner",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    state.workspaces.push({
      id: workspaceId,
      name: "Existing Workspace",
      organization_id: "org-existing-0000-0000-0000-000000000001",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    state.plans.push({
      workspace_id: workspaceId,
      plan: "free",
      invoice_limit_monthly: 5,
      client_limit: 5,
    });

    const admin = createMockAdmin(state);
    const result = await bootstrapWorkspaceForUser(admin, userId);

    assert.equal(result, workspaceId);
    assert.equal(state.insertCounts.organizations, 0);
    assert.equal(state.insertCounts.workspaces, 0);
    assert.equal(state.insertCounts.memberships, 0);
  });

  it("Test 2 — bootstraps a new user with schema-valid organization insert", async () => {
    const userId = "user-new";
    const state = createEmptyState(userId, "new.user@example.com");
    const admin = createMockAdmin(state);

    const workspaceId = await bootstrapWorkspaceForUser(admin, userId);

    assert.ok(workspaceId.startsWith("ws-"));
    assert.equal(state.insertCounts.organizations, 1);
    assert.equal(state.insertCounts.workspaces, 1);
    assert.equal(state.insertCounts.memberships, 1);
    assert.equal(state.organizations[0]?.name, "New.user");
    assert.equal(Object.keys(state.organizations[0] ?? {}).sort().join(","), "created_at,id,name");
    assert.equal(state.memberships[0]?.role, "owner");
    assert.equal(state.plans.length, 1);
    assert.equal(state.plans[0]?.workspace_id, workspaceId);
    assert.equal(state.insertCounts.settings, 1);
    assert.equal(state.insertCounts.emailSettings, 1);
    assert.equal(state.settings[0]?.auto_send_reminders, false);
    assert.equal(state.emailSettings[0]?.workspace_id, workspaceId);
  });

  it("Test 3 — repeated bootstrap returns the same workspace id", async () => {
    const userId = "user-repeat";
    const state = createEmptyState(userId, "repeat@example.com");
    const admin = createMockAdmin(state);

    const first = await bootstrapWorkspaceForUser(admin, userId);
    const second = await bootstrapWorkspaceForUser(admin, userId);

    assert.equal(first, second);
    assert.equal(state.insertCounts.organizations, 1);
    assert.equal(state.insertCounts.workspaces, 1);
    assert.equal(state.insertCounts.memberships, 1);
  });

  it("Test 4 — repairs missing owner membership on an identified workspace", async () => {
    const userId = "user-repair";
    const workspaceId = "ws-repair-0000-0000-0000-000000000001";
    const state = createEmptyState(userId, "repair@example.com");
    state.workspaces.push({
      id: workspaceId,
      name: "Repair Workspace",
      organization_id: "org-repair-0000-0000-0000-000000000001",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    const admin = createMockAdmin(state);

    const result = await ensureOwnerMembership(admin, userId, workspaceId);

    assert.equal(result, workspaceId);
    assert.equal(state.insertCounts.memberships, 1);
    assert.equal(state.insertCounts.workspaces, 0);
    assert.equal(state.memberships[0]?.role, "owner");
  });

  it("Test 5 — settings failure is best-effort and bootstrap still succeeds", async () => {
    const userId = "user-settings-fail";
    const state = createEmptyState(userId, "settings@example.com");
    state.settingsInsertShouldFail = true;
    const admin = createMockAdmin(state);

    const workspaceId = await bootstrapWorkspaceForUser(admin, userId);

    assert.ok(workspaceId.startsWith("ws-"));
    assert.equal(state.insertCounts.settings, 1);
    assert.equal(state.settings.length, 0);
    assert.equal(state.memberships.length, 1);
  });

  it("Test 6 — plan initialization failure fails bootstrap clearly", async () => {
    const userId = "user-plan-fail";
    const workspaceId = "ws-plan-fail-0000-0000-0000-000000000001";
    const state = createEmptyState(userId, "plan@example.com");
    state.workspaces.push({
      id: workspaceId,
      name: "Plan Workspace",
      organization_id: "org-plan-0000-0000-0000-000000000001",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    state.memberships.push({
      workspace_id: workspaceId,
      user_id: userId,
      role: "owner",
      created_at: "2026-01-01T00:00:00.000Z",
    });
    state.planInsertShouldFail = true;
    const admin = createMockAdmin(state);

    await assert.rejects(
      () => ensureDefaultWorkspacePlan(admin, workspaceId, userId),
      (error: unknown) => {
        assert.ok(error instanceof WorkspaceBootstrapError);
        assert.equal(error.stage, "create_default_plan");
        assert.equal(error.supabaseCode, "42501");
        return true;
      }
    );
  });

  it("Test 7 — organization insert payload uses only migration-supported columns", () => {
    const payload = buildOrganizationInsertPayload("Acme");
    assert.deepEqual(payload, { name: "Acme" });
    assert.deepEqual(ORGANIZATION_BOOTSTRAP_COLUMNS, ["name"]);
    assert.deepEqual(Object.keys(payload).sort(), [...ORGANIZATION_BOOTSTRAP_COLUMNS].sort());
  });

  it("Test 8 — admin repair delegates to canonical bootstrap helper", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");

    const repairSource = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../admin/repairUserWorkspace.ts"),
      "utf8"
    );
    assert.match(repairSource, /ensureWorkspaceForUser/);

    const userId = "user-admin-repair";
    const state = createEmptyState(userId, "admin-repair@example.com");
    const admin = createMockAdmin(state);

    const membershipCount = (await admin
      .from("workspace_members")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)) as { count: number; error: null };
    assert.equal(membershipCount.count, 0);

    const workspaceId = await bootstrapWorkspaceForUser(admin, userId);
    assert.ok(workspaceId.startsWith("ws-"));
    assert.equal(await loadExistingWorkspaceForUser(admin, userId), workspaceId);
  });
});

describe("ensureWorkspaceSettings", () => {
  it("does not throw when settings insert fails", async () => {
    const userId = "user-settings-helper";
    const workspaceId = "ws-settings-helper-0000-0000-0000-000000000001";
    const state = createEmptyState(userId, "helper@example.com");
    state.settingsInsertShouldFail = true;
    const admin = createMockAdmin(state);

    await assert.doesNotReject(() => ensureWorkspaceSettings(admin, workspaceId, userId));
  });

  it("K — new workspace defaults auto_send_reminders to false", async () => {
    const userId = "user-settings-default";
    const workspaceId = "ws-settings-default-0000-0000-0000-000000000001";
    const state = createEmptyState(userId, "default@example.com");
    const admin = createMockAdmin(state);

    await ensureWorkspaceSettings(admin, workspaceId, userId);

    assert.equal(state.settings.length, 1);
    assert.equal(state.settings[0]?.workspace_id, workspaceId);
    assert.equal(state.settings[0]?.auto_send_reminders, false);
  });
});

function assertFreshStandaloneTrialPersistence(
  state: MockState,
  workspaceId: string
): void {
  assert.equal(state.plans.length, 1);
  assert.equal(state.plans[0]?.plan, "free");
  assert.equal(state.plans[0]?.client_limit, 5);
  assert.equal(state.plans[0]?.invoice_limit_monthly, 5);
  assert.equal(state.subscriptions.length, 1);
  assert.equal(state.subscriptions[0]?.plan, "free");
  assert.equal(state.subscriptions[0]?.status, "trial");
  assert.ok(state.subscriptions[0]?.trial_starts_at);
  assert.ok(state.subscriptions[0]?.trial_ends_at);
  assert.ok(state.subscriptions[0]?.trial_consumed_at);
  const workspace = state.workspaces.find((row) => row.id === workspaceId);
  assert.ok(workspace?.trial_consumed_at);
  assert.equal(
    state.subscriptions[0]?.trial_consumed_at,
    workspace?.trial_consumed_at
  );
  assert.equal(
    state.subscriptions[0]?.trial_starts_at,
    state.subscriptions[0]?.trial_consumed_at
  );
  const trialStartMs = Date.parse(state.subscriptions[0]!.trial_starts_at!);
  const trialEndMs = Date.parse(state.subscriptions[0]!.trial_ends_at!);
  assert.equal(trialEndMs - trialStartMs, TRIAL_DURATION_DAYS * MS_PER_DAY);
}

describe("ensureDefaultWorkspacePlan trial intent (R5 P2)", () => {
  it("always persists free workspace plan shell on first insert", async () => {
    const userId = "user-free-plan";
    const workspaceId = "ws-free-0000-0000-0000-000000000001";
    const state = createEmptyState(userId, "free@example.com");
    const admin = createMockAdmin(state);

    const result = await ensureDefaultWorkspacePlan(admin, workspaceId, userId);

    assert.equal(result.planCreated, true);
    assert.equal(result.plan, "free");
    assert.equal(state.plans[0]?.plan, "free");
    assert.equal(state.plans[0]?.client_limit, 5);
    assert.equal(state.plans[0]?.invoice_limit_monthly, 5);
  });

  it("bootstrap creates standalone Arrexia trial subscription metadata", async () => {
    const userId = "user-starter-bootstrap";
    const state = createEmptyState(userId, "starter-bootstrap@example.com");
    const admin = createMockAdmin(state);

    await bootstrapWorkspaceForUser(admin, userId, { initialTrialPlan: "starter" });

    assert.equal(state.plans[0]?.plan, "free");
    assert.equal(state.insertCounts.subscriptions, 1);
    assert.equal(state.subscriptions[0]?.status, "trial");
    assert.equal(state.subscriptions[0]?.plan, "free");
    assert.ok(state.subscriptions[0]?.trial_ends_at);
    assert.ok(state.subscriptions[0]?.trial_consumed_at);
    assert.ok(state.workspaces[0]?.trial_consumed_at);
  });

  it("throws when standalone trial subscription cannot be created", async () => {
    const userId = "user-subscription-fail";
    const state = createEmptyState(userId, "fail@example.com");
    state.subscriptionInsertShouldFail = true;
    const admin = createMockAdmin(state);

    await assert.rejects(
      () =>
        bootstrapWorkspaceForUser(admin, userId, {
          initialTrialPlan: "pro",
        }),
      (error: unknown) => {
        assert.ok(error instanceof WorkspaceBootstrapError);
        assert.equal(error.stage, "create_default_plan");
        return true;
      }
    );

    assert.equal(state.plans[0]?.plan, "free");
    assert.equal(state.plans[0]?.client_limit, 5);
    assert.equal(state.subscriptions.length, 0);
  });

  it("does not upgrade an existing workspace plan", async () => {
    const userId = "user-existing-pro";
    const workspaceId = "ws-existing-pro-0000-0000-0000-000000000001";
    const state = createEmptyState(userId, "existing@example.com");
    state.plans.push({
      workspace_id: workspaceId,
      plan: "free",
      invoice_limit_monthly: 5,
      client_limit: 5,
    });
    const admin = createMockAdmin(state);

    const result = await ensureDefaultWorkspacePlan(admin, workspaceId, userId);

    assert.equal(result.planCreated, false);
    assert.equal(result.plan, "free");
    assert.equal(state.plans.length, 1);
    assert.equal(state.plans[0]?.plan, "free");
  });

  it("bootstrap retry remains idempotent for new users", async () => {
    const userId = "user-starter-idempotent";
    const state = createEmptyState(userId, "idempotent@example.com");
    const admin = createMockAdmin(state);

    const first = await bootstrapWorkspaceForUser(admin, userId, {
      initialTrialPlan: "starter",
    });
    const second = await bootstrapWorkspaceForUser(admin, userId, {
      initialTrialPlan: "pro",
    });

    assert.equal(first, second);
    assert.equal(state.plans.length, 1);
    assert.equal(state.plans[0]?.plan, "free");
    assert.equal(state.insertCounts.organizations, 1);
  });

  it("creates standalone trial on bootstrap retry without promoting workspace plan", async () => {
    const userId = "user-starter-recovery";
    const workspaceId = "ws-starter-recovery-0000-0000-000000000001";
    const state = createEmptyState(userId, "recovery@example.com");
    state.memberships.push({
      workspace_id: workspaceId,
      user_id: userId,
      role: "owner",
      created_at: new Date().toISOString(),
    });
    state.workspaces.push({
      id: workspaceId,
      name: "My Workspace",
      organization_id: "org-recovery",
      created_at: new Date().toISOString(),
    });
    state.plans.push({
      workspace_id: workspaceId,
      plan: "free",
      invoice_limit_monthly: 5,
      client_limit: 5,
    });
    const admin = createMockAdmin(state);

    await bootstrapWorkspaceForUser(admin, userId, { initialTrialPlan: "starter" });

    assert.equal(state.plans[0]?.plan, "free");
    assert.equal(state.insertCounts.subscriptions, 1);
    assert.equal(state.subscriptions[0]?.status, "trial");
    assert.equal(state.subscriptions[0]?.plan, "free");
  });

  it("ignores pro marketing intent on bootstrap retry", async () => {
    const userId = "user-pro-recovery";
    const workspaceId = "ws-pro-recovery-0000-0000-000000000001";
    const state = createEmptyState(userId, "pro-recovery@example.com");
    state.memberships.push({
      workspace_id: workspaceId,
      user_id: userId,
      role: "owner",
      created_at: new Date().toISOString(),
    });
    state.workspaces.push({
      id: workspaceId,
      name: "My Workspace",
      organization_id: "org-pro-recovery",
      created_at: new Date().toISOString(),
    });
    state.plans.push({
      workspace_id: workspaceId,
      plan: "free",
      invoice_limit_monthly: 5,
      client_limit: 5,
    });
    const admin = createMockAdmin(state);

    await bootstrapWorkspaceForUser(admin, userId, { initialTrialPlan: "pro" });

    assert.equal(state.plans[0]?.plan, "free");
    assert.equal(state.subscriptions[0]?.plan, "free");
    assert.equal(state.subscriptions[0]?.status, "trial");
  });

  it("does not duplicate an existing active trial subscription on retry", async () => {
    const userId = "user-existing-trial";
    const workspaceId = "ws-existing-trial-0000-0000-000000000001";
    const state = createEmptyState(userId, "trial@example.com");
    state.memberships.push({
      workspace_id: workspaceId,
      user_id: userId,
      role: "owner",
      created_at: new Date().toISOString(),
    });
    state.workspaces.push({
      id: workspaceId,
      name: "My Workspace",
      organization_id: "org-existing-trial",
      created_at: new Date().toISOString(),
    });
    state.plans.push({
      workspace_id: workspaceId,
      plan: "starter",
      invoice_limit_monthly: 50,
      client_limit: 25,
    });
    state.subscriptions.push({
      workspace_id: workspaceId,
      plan: "starter",
      status: "trial",
      trial_starts_at: "2026-07-01T00:00:00.000Z",
      trial_ends_at: "2026-08-01T00:00:00.000Z",
    });
    const admin = createMockAdmin(state);

    await bootstrapWorkspaceForUser(admin, userId, { initialTrialPlan: "pro" });

    assert.equal(state.plans[0]?.plan, "starter");
    assert.equal(state.subscriptions.length, 1);
    assert.equal(state.insertCounts.subscriptions, 0);
  });

  it("does not overwrite an existing paid subscription on retry", async () => {
    const userId = "user-paid";
    const workspaceId = "ws-paid-0000-0000-000000000001";
    const state = createEmptyState(userId, "paid@example.com");
    state.memberships.push({
      workspace_id: workspaceId,
      user_id: userId,
      role: "owner",
      created_at: new Date().toISOString(),
    });
    state.workspaces.push({
      id: workspaceId,
      name: "My Workspace",
      organization_id: "org-paid",
      created_at: new Date().toISOString(),
    });
    state.plans.push({
      workspace_id: workspaceId,
      plan: "free",
      invoice_limit_monthly: 5,
      client_limit: 5,
    });
    state.subscriptions.push({
      workspace_id: workspaceId,
      plan: "pro",
      status: "active",
      trial_starts_at: null,
      trial_ends_at: null,
    });
    const admin = createMockAdmin(state);

    await bootstrapWorkspaceForUser(admin, userId, { initialTrialPlan: "starter" });

    assert.equal(state.plans[0]?.plan, "free");
    assert.equal(state.subscriptions[0]?.status, "active");
    assert.equal(state.insertCounts.subscriptions, 0);
  });
});

describe("maybePromoteFreePlanToPublicTrial", () => {
  it("does not grant trial to grandfathered legacy free workspace", async () => {
    const userId = "user-no-intent";
    const workspaceId = "ws-no-intent-0000-0000-000000000001";
    const state = createEmptyState(userId, "no-intent@example.com");
    state.plans.push({
      workspace_id: workspaceId,
      plan: "free",
      invoice_limit_monthly: 5,
      client_limit: 5,
    });
    state.workspaces.push({
      id: workspaceId,
      name: "Legacy Workspace",
      organization_id: "org-legacy",
      created_at: "2020-01-01T00:00:00.000Z",
    });
    const admin = createMockAdmin(state);

    const result = await maybePromoteFreePlanToPublicTrial(admin, workspaceId, userId, {
      initialTrialPlan: null,
      planCreated: false,
      currentPlan: "free",
    });

    assert.equal(result, "free");
    assert.equal(state.insertCounts.subscriptions, 0);
  });

  it("creates standalone trial subscription without changing workspace plan row", async () => {
    const userId = "user-promote-starter";
    const workspaceId = "ws-promote-starter-0000-0000-000000000001";
    const state = createEmptyState(userId, "promote@example.com");
    state.plans.push({
      workspace_id: workspaceId,
      plan: "free",
      invoice_limit_monthly: 5,
      client_limit: 5,
    });
    state.workspaces.push({
      id: workspaceId,
      name: "My Workspace",
      organization_id: "org-promote",
      created_at: new Date().toISOString(),
    });
    const admin = createMockAdmin(state);

    const result = await maybePromoteFreePlanToPublicTrial(admin, workspaceId, userId, {
      initialTrialPlan: "starter",
      planCreated: true,
      currentPlan: "free",
    });

    assert.equal(result, "free");
    assert.equal(state.plans[0]?.plan, "free");
    assert.equal(state.insertCounts.subscriptions, 1);
    assert.equal(state.subscriptions[0]?.plan, "free");
    assert.equal(state.subscriptions[0]?.status, "trial");
  });
});

describe("fresh signup standalone trial persistence", () => {
  for (const ctaPlan of ["starter", "pro", "business"] as SignupMarketingPlanIntent[]) {
    it(`${ctaPlan} CTA creates generic free standalone trial`, async () => {
      const userId = `user-cta-${ctaPlan}`;
      const state = createEmptyState(userId, `${ctaPlan}@example.com`);
      const admin = createMockAdmin(state);

      const workspaceId = await bootstrapWorkspaceForUser(admin, userId, {
        initialTrialPlan: ctaPlan,
      });

      assertFreshStandaloneTrialPersistence(state, workspaceId);
    });
  }

  it("generic signup without CTA plan persists free standalone trial", async () => {
    const userId = "user-generic-signup";
    const state = createEmptyState(userId, "generic@example.com");
    const admin = createMockAdmin(state);

    const workspaceId = await bootstrapWorkspaceForUser(admin, userId);

    assertFreshStandaloneTrialPersistence(state, workspaceId);
  });

  it("bootstrap retry does not extend trial or clear durable consumption marker", async () => {
    const userId = "user-retry-idempotent";
    const state = createEmptyState(userId, "retry@example.com");
    const admin = createMockAdmin(state);

    await bootstrapWorkspaceForUser(admin, userId, { initialTrialPlan: "starter" });
    const firstStart = state.subscriptions[0]?.trial_starts_at;
    const firstEnd = state.subscriptions[0]?.trial_ends_at;
    const firstConsumed = state.subscriptions[0]?.trial_consumed_at;
    const workspaceConsumed = state.workspaces[0]?.trial_consumed_at;

    await bootstrapWorkspaceForUser(admin, userId, { initialTrialPlan: "pro" });

    assert.equal(state.subscriptions.length, 1);
    assert.equal(state.subscriptions[0]?.trial_starts_at, firstStart);
    assert.equal(state.subscriptions[0]?.trial_ends_at, firstEnd);
    assert.equal(state.subscriptions[0]?.trial_consumed_at, firstConsumed);
    assert.equal(state.workspaces[0]?.trial_consumed_at, workspaceConsumed);
    assert.equal(state.plans[0]?.plan, "free");
    assert.equal(state.subscriptions[0]?.plan, "free");
  });

  it("legacy starter trial row on retry is not rewritten into a new trial", async () => {
    const userId = "user-legacy-starter-trial";
    const workspaceId = "ws-legacy-starter-0000-0000-000000000001";
    const state = createEmptyState(userId, "legacy@example.com");
    state.memberships.push({
      workspace_id: workspaceId,
      user_id: userId,
      role: "owner",
      created_at: new Date().toISOString(),
    });
    state.workspaces.push({
      id: workspaceId,
      name: "Legacy Workspace",
      organization_id: "org-legacy",
      created_at: new Date().toISOString(),
      trial_consumed_at: null,
    });
    state.plans.push({
      workspace_id: workspaceId,
      plan: "starter",
      invoice_limit_monthly: 50,
      client_limit: 25,
    });
    state.subscriptions.push({
      workspace_id: workspaceId,
      plan: "starter",
      status: "trial",
      trial_starts_at: "2026-07-01T00:00:00.000Z",
      trial_ends_at: "2026-07-15T00:00:00.000Z",
    });
    const admin = createMockAdmin(state);

    await bootstrapWorkspaceForUser(admin, userId, { initialTrialPlan: "pro" });

    assert.equal(state.plans[0]?.plan, "starter");
    assert.equal(state.subscriptions.length, 1);
    assert.equal(state.insertCounts.subscriptions, 0);
    assert.equal(state.subscriptions[0]?.trial_starts_at, "2026-07-01T00:00:00.000Z");
  });
});

describe("ensureStandaloneTrialIfNeeded one-trial recovery invariant", () => {
  function seedPartialBootstrap(state: MockState, userId: string, workspaceId: string) {
    state.memberships.push({
      workspace_id: workspaceId,
      user_id: userId,
      role: "owner",
      created_at: new Date().toISOString(),
    });
    state.workspaces.push({
      id: workspaceId,
      name: "Recovery Workspace",
      organization_id: "org-recovery",
      created_at: new Date().toISOString(),
      trial_consumed_at: null,
    });
    state.plans.push({
      workspace_id: workspaceId,
      plan: "free",
      invoice_limit_monthly: 5,
      client_limit: 5,
    });
  }

  it("1 — fresh partially-created workspace can recover initial trial", async () => {
    const userId = "user-recover-fresh";
    const workspaceId = "ws-recover-fresh-0000-0000-0000-000000000001";
    const state = createEmptyState(userId, "recover-fresh@example.com");
    seedPartialBootstrap(state, userId, workspaceId);
    const admin = createMockAdmin(state);

    const result = await ensureStandaloneTrialIfNeeded(admin, workspaceId, userId, {
      planCreated: true,
    });

    assert.equal(result.created, true);
    assert.equal(state.subscriptions.length, 1);
    assert.equal(state.subscriptions[0]?.status, "trial");
    assert.equal(state.subscriptions[0]?.plan, "free");
    assert.ok(state.subscriptions[0]?.trial_consumed_at);
    assert.equal(
      state.workspaces[0]?.trial_consumed_at,
      state.subscriptions[0]?.trial_consumed_at
    );
  });

  it("2 — bootstrap retry does not extend trial", async () => {
    const userId = "user-recover-no-extend";
    const workspaceId = "ws-recover-no-extend-0000-0000-0000-000000000001";
    const state = createEmptyState(userId, "no-extend@example.com");
    seedPartialBootstrap(state, userId, workspaceId);
    state.subscriptions.push({
      workspace_id: workspaceId,
      plan: "free",
      status: "trial",
      trial_starts_at: "2026-07-01T00:00:00.000Z",
      trial_ends_at: "2026-07-15T00:00:00.000Z",
      trial_consumed_at: "2026-07-01T00:00:00.000Z",
    });
    const admin = createMockAdmin(state);

    const result = await ensureStandaloneTrialIfNeeded(admin, workspaceId, userId, {
      planCreated: true,
    });

    assert.equal(result.created, false);
    assert.equal(state.subscriptions.length, 1);
    assert.equal(state.subscriptions[0]?.trial_ends_at, "2026-07-15T00:00:00.000Z");
  });

  it("3 — already-consumed trial cannot restart", async () => {
    const userId = "user-consumed";
    const workspaceId = "ws-consumed-0000-0000-0000-000000000001";
    const state = createEmptyState(userId, "consumed@example.com");
    seedPartialBootstrap(state, userId, workspaceId);
    state.workspaces[0]!.trial_consumed_at = "2026-06-01T00:00:00.000Z";
    const admin = createMockAdmin(state);

    const result = await ensureStandaloneTrialIfNeeded(admin, workspaceId, userId, {
      planCreated: true,
    });

    assert.equal(result.created, false);
    assert.equal(state.subscriptions.length, 0);
  });

  it("4 — expired trial cannot restart", async () => {
    const userId = "user-expired";
    const workspaceId = "ws-expired-0000-0000-0000-000000000001";
    const state = createEmptyState(userId, "expired@example.com");
    seedPartialBootstrap(state, userId, workspaceId);
    state.subscriptions.push({
      workspace_id: workspaceId,
      plan: "free",
      status: "trial",
      trial_starts_at: "2026-06-01T00:00:00.000Z",
      trial_ends_at: "2026-06-15T00:00:00.000Z",
      trial_consumed_at: "2026-06-01T00:00:00.000Z",
    });
    const admin = createMockAdmin(state);

    const result = await ensureStandaloneTrialIfNeeded(admin, workspaceId, userId, {
      planCreated: true,
    });

    assert.equal(result.created, false);
    assert.equal(state.subscriptions.length, 1);
  });

  it("5 — paid former-trial workspace cannot restart", async () => {
    const userId = "user-paid-former";
    const workspaceId = "ws-paid-former-0000-0000-0000-000000000001";
    const state = createEmptyState(userId, "paid-former@example.com");
    seedPartialBootstrap(state, userId, workspaceId);
    state.workspaces[0]!.trial_consumed_at = "2026-06-01T00:00:00.000Z";
    state.subscriptions.push({
      workspace_id: workspaceId,
      plan: "starter",
      status: "active",
      trial_starts_at: null,
      trial_ends_at: null,
      trial_consumed_at: "2026-06-01T00:00:00.000Z",
    });
    const admin = createMockAdmin(state);

    const result = await ensureStandaloneTrialIfNeeded(admin, workspaceId, userId, {
      planCreated: true,
    });

    assert.equal(result.created, false);
    assert.equal(state.insertCounts.subscriptions, 0);
  });

  it("6 — manipulated signup plan/query cannot restart", async () => {
    const userId = "user-manipulated";
    const workspaceId = "ws-manipulated-0000-0000-0000-000000000001";
    const state = createEmptyState(userId, "manipulated@example.com");
    seedPartialBootstrap(state, userId, workspaceId);
    state.workspaces[0]!.created_at = "2020-01-01T00:00:00.000Z";
    state.workspaces[0]!.trial_consumed_at = "2020-01-01T00:00:00.000Z";
    const admin = createMockAdmin(state);

    const result = await ensureStandaloneTrialIfNeeded(admin, workspaceId, userId, {
      planCreated: false,
    });

    assert.equal(result.created, false);
    assert.equal(state.subscriptions.length, 0);
  });

  it("7 — missing subscription row alone cannot restart when durable evidence exists", async () => {
    const userId = "user-durable-evidence";
    const workspaceId = "ws-durable-evidence-0000-0000-0000-000000000001";
    const state = createEmptyState(userId, "durable@example.com");
    seedPartialBootstrap(state, userId, workspaceId);
    state.workspaces[0]!.trial_consumed_at = "2026-05-01T00:00:00.000Z";
    const admin = createMockAdmin(state);

    const result = await ensureStandaloneTrialIfNeeded(admin, workspaceId, userId, {
      planCreated: true,
    });

    assert.equal(result.created, false);
    assert.equal(state.subscriptions.length, 0);
  });

  it("3b — bootstrap retry does not recreate existing trial row", async () => {
    const userId = "user-no-recreate";
    const workspaceId = "ws-no-recreate-0000-0000-0000-000000000001";
    const state = createEmptyState(userId, "no-recreate@example.com");
    seedPartialBootstrap(state, userId, workspaceId);
    state.subscriptions.push({
      workspace_id: workspaceId,
      plan: "free",
      status: "trial",
      trial_starts_at: "2026-07-01T00:00:00.000Z",
      trial_ends_at: "2026-07-15T00:00:00.000Z",
      trial_consumed_at: "2026-07-01T00:00:00.000Z",
    });
    const admin = createMockAdmin(state);

    await ensureStandaloneTrialIfNeeded(admin, workspaceId, userId, { planCreated: true });
    await ensureStandaloneTrialIfNeeded(admin, workspaceId, userId, { planCreated: true });

    assert.equal(state.subscriptions.length, 1);
    assert.equal(state.insertCounts.subscriptions, 0);
  });

  it("9 — ordinary login on old workspace does not create trial", async () => {
    const userId = "user-ordinary-login";
    const workspaceId = "ws-ordinary-login-0000-0000-0000-000000000001";
    const state = createEmptyState(userId, "login@example.com");
    state.memberships.push({
      workspace_id: workspaceId,
      user_id: userId,
      role: "owner",
      created_at: "2020-01-01T00:00:00.000Z",
    });
    state.workspaces.push({
      id: workspaceId,
      name: "Old Workspace",
      organization_id: "org-old",
      created_at: "2020-01-01T00:00:00.000Z",
      trial_consumed_at: null,
    });
    state.plans.push({
      workspace_id: workspaceId,
      plan: "free",
      invoice_limit_monthly: 5,
      client_limit: 5,
    });
    const admin = createMockAdmin(state);

    await bootstrapWorkspaceForUser(admin, userId);

    assert.equal(state.insertCounts.subscriptions, 0);
    assert.equal(state.subscriptions.length, 0);
  });

  it("10 — founder admin repair delegates through explicit authorized path", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");

    const repairSource = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../admin/repairUserWorkspace.ts"),
      "utf8"
    );
    assert.match(repairSource, /repairUserWorkspace/);
    assert.match(repairSource, /ensureWorkspaceForUser/);
    assert.doesNotMatch(repairSource, /createArrexiaTrialSubscription/);
  });
});
