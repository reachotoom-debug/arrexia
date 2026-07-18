import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  ORGANIZATION_BOOTSTRAP_COLUMNS,
  WorkspaceBootstrapError,
  bootstrapWorkspaceForUser,
  buildOrganizationInsertPayload,
  ensureDefaultWorkspacePlan,
  ensureOwnerMembership,
  ensureWorkspaceSettings,
  loadExistingWorkspaceForUser,
  type WorkspaceBootstrapAdmin,
} from "../ensureWorkspaceForUser";

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
};

type SettingsRow = {
  workspace_id: string;
  default_currency: string;
};

type PlanRow = {
  workspace_id: string;
  plan: string;
  invoice_limit_monthly: number;
  client_limit: number;
};

type MockState = {
  memberships: MembershipRow[];
  organizations: OrganizationRow[];
  workspaces: WorkspaceRow[];
  settings: SettingsRow[];
  plans: PlanRow[];
  authUsers: Map<string, { email: string }>;
  insertCounts: {
    organizations: number;
    workspaces: number;
    memberships: number;
    settings: number;
    plans: number;
  };
  settingsInsertShouldFail?: boolean;
  planInsertShouldFail?: boolean;
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
  private headCount = false;

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

  insert(row: Record<string, unknown>) {
    this.pendingInsert = row;
    return this;
  }

  maybeSingle() {
    if (this.pendingInsert) {
      const result = this.performInsert();
      this.pendingInsert = null;
      return Promise.resolve({ data: result.data, error: result.error });
    }

    const rows = this.getRows();
    return Promise.resolve({ data: rows[0] ?? null, error: null });
  }

  single() {
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
      default:
        return { data: null, error: { message: `Unknown table ${this.table}`, code: "mock" } };
    }
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
    authUsers: new Map([[userId, { email }]]),
    insertCounts: {
      organizations: 0,
      workspaces: 0,
      memberships: 0,
      settings: 0,
      plans: 0,
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
});
