import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CANONICAL_REMINDER_STAGES,
  CANONICAL_TEMPLATE_CODES,
  getDefaultEnabledForPlan,
} from "../canonicalDefaults";
import {
  provisionDefaultReminderSetup,
  summarizeCanonicalRuleBindings,
  type ProvisionAdmin,
} from "../provisionDefaultSetup";

type TemplateRow = {
  id: string;
  workspace_id: string;
  code: string;
  name: string;
  subject: string;
  body: string;
  is_enabled: boolean;
  sort_order: number;
  channel: string;
};

type RuleRow = {
  id: string;
  workspace_id: string;
  template_id: string;
  name: string;
  trigger_type: string;
  offset_days: number;
  for_status: string;
  is_enabled: boolean;
  sort_order: number;
};

type MockState = {
  templates: TemplateRow[];
  rules: RuleRow[];
  nextTemplateIndex: number;
  nextRuleIndex: number;
  updateCount: number;
};

const WORKSPACE_A = "ws-a-0000-0000-0000-000000000001";
const WORKSPACE_B = "ws-b-0000-0000-0000-000000000002";

function createState(): MockState {
  return {
    templates: [],
    rules: [],
    nextTemplateIndex: 1,
    nextRuleIndex: 1,
    updateCount: 0,
  };
}

function newTemplateId(state: MockState): string {
  return `tpl-${state.nextTemplateIndex++}-0000-0000-0000-000000000001`;
}

function newRuleId(state: MockState): string {
  return `rule-${state.nextRuleIndex++}-0000-0000-0000-000000000001`;
}

function createMockAdmin(state: MockState): ProvisionAdmin {
  return {
    from(table: string) {
      return new MockQueryBuilder(table, state) as unknown as ReturnType<
        ProvisionAdmin["from"]
      >;
    },
  };
}

function ruleForCode(state: MockState, workspaceId: string, code: string): RuleRow | undefined {
  const template = state.templates.find(
    (t) => t.workspace_id === workspaceId && t.code === code
  );
  if (!template) return undefined;
  return state.rules.find((r) => r.template_id === template.id);
}

function templateForCode(
  state: MockState,
  workspaceId: string,
  code: string
): TemplateRow | undefined {
  return state.templates.find(
    (t) => t.workspace_id === workspaceId && t.code === code
  );
}

class MockQueryBuilder {
  private table: string;
  private state: MockState;
  private filters: Array<(row: Record<string, unknown>) => boolean> = [];
  private pendingInsert: Record<string, unknown> | null = null;
  private pendingUpdate: Record<string, unknown> | null = null;
  private operation: "select" | "insert" | "update" | null = null;

  constructor(table: string, state: MockState) {
    this.table = table;
    this.state = state;
  }

  select(_columns: string) {
    if (this.operation !== "insert" && this.operation !== "update") {
      this.operation = "select";
    }
    return this;
  }

  insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
    this.operation = "insert";
    this.pendingInsert = Array.isArray(payload) ? payload[0] : payload;
    return this;
  }

  update(payload: Record<string, unknown>) {
    this.operation = "update";
    this.pendingUpdate = payload;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  maybeSingle() {
    return this.executeSingle();
  }

  private getRows(): Record<string, unknown>[] {
    if (this.table === "reminder_templates") {
      return this.state.templates as unknown as Record<string, unknown>[];
    }
    if (this.table === "reminder_rules") {
      return this.state.rules as unknown as Record<string, unknown>[];
    }
    return [];
  }

  private applyFilters<T extends Record<string, unknown>>(rows: T[]): T[] {
    return rows.filter((row) => this.filters.every((fn) => fn(row)));
  }

  private async executeSingle(): Promise<{ data: unknown; error: unknown }> {
    if (this.operation === "insert" && this.pendingInsert) {
      const payload = this.pendingInsert;
      if (this.table === "reminder_templates") {
        const duplicate = this.state.templates.find(
          (row) =>
            row.workspace_id === payload.workspace_id &&
            row.code === payload.code
        );
        if (duplicate) {
          return { data: null, error: { code: "23505", message: "duplicate" } };
        }

        const row: TemplateRow = {
          id: newTemplateId(this.state),
          workspace_id: String(payload.workspace_id),
          code: String(payload.code),
          name: String(payload.name),
          subject: String(payload.subject),
          body: String(payload.body),
          is_enabled: Boolean(payload.is_enabled),
          sort_order: Number(payload.sort_order),
          channel: String(payload.channel ?? "email"),
        };
        this.state.templates.push(row);
        return { data: row, error: null };
      }

      if (this.table === "reminder_rules") {
        const row: RuleRow = {
          id: newRuleId(this.state),
          workspace_id: String(payload.workspace_id),
          template_id: String(payload.template_id),
          name: String(payload.name),
          trigger_type: String(payload.trigger_type),
          offset_days: Number(payload.offset_days),
          for_status: String(payload.for_status),
          is_enabled: Boolean(payload.is_enabled),
          sort_order: Number(payload.sort_order),
        };
        this.state.rules.push(row);
        return { data: row, error: null };
      }
    }

    if (this.operation === "update" && this.pendingUpdate) {
      const rows = this.applyFilters(this.getRows());
      const target = rows[0];
      if (target) {
        Object.assign(target, this.pendingUpdate);
        this.state.updateCount += 1;
        return { data: target, error: null };
      }
    }

    const rows = this.applyFilters(this.getRows());
    return { data: rows[0] ?? null, error: null };
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: { data: unknown; error: unknown }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    if (this.operation === "update" && this.pendingUpdate) {
      const rows = this.applyFilters(this.getRows());
      for (const row of rows) {
        Object.assign(row, this.pendingUpdate);
        this.state.updateCount += 1;
      }
      return Promise.resolve({ data: null, error: null }).then(onfulfilled, onrejected);
    }

    const rows = this.applyFilters(this.getRows());
    return Promise.resolve({ data: rows, error: null }).then(onfulfilled, onrejected);
  }
}

function workspaceTemplates(state: MockState, workspaceId: string): TemplateRow[] {
  return state.templates.filter((t) => t.workspace_id === workspaceId);
}

function workspaceRules(state: MockState, workspaceId: string): RuleRow[] {
  return state.rules.filter((r) => r.workspace_id === workspaceId);
}

describe("provisionDefaultReminderSetup — R2E.1 non-destructive invariant", () => {
  it("A — empty Pro workspace gets 5 rules, all enabled", async () => {
    const state = createState();
    const admin = createMockAdmin(state);

    const result = await provisionDefaultReminderSetup({
      workspaceId: WORKSPACE_A,
      plan: "pro",
      admin,
    });

    assert.equal(result.templatesCreated, 5);
    assert.equal(result.rulesCreated, 5);
    assert.equal(workspaceRules(state, WORKSPACE_A).length, 5);
    for (const rule of workspaceRules(state, WORKSPACE_A)) {
      assert.equal(rule.is_enabled, true);
    }
  });

  it("B — empty Starter workspace gets 3 enabled and 2 disabled rules", async () => {
    const state = createState();
    const admin = createMockAdmin(state);

    await provisionDefaultReminderSetup({
      workspaceId: WORKSPACE_A,
      plan: "starter",
      admin,
    });

    for (const stage of CANONICAL_REMINDER_STAGES) {
      const rule = ruleForCode(state, WORKSPACE_A, stage.code);
      assert.equal(
        rule?.is_enabled,
        getDefaultEnabledForPlan("starter", stage.code),
        stage.code
      );
    }
  });

  it("C — Starter → Pro preserves existing disabled plus_3", async () => {
    const state = createState();
    const admin = createMockAdmin(state);

    await provisionDefaultReminderSetup({
      workspaceId: WORKSPACE_A,
      plan: "starter",
      admin,
    });

    const plusThree = ruleForCode(state, WORKSPACE_A, "plus_3");
    assert.equal(plusThree?.is_enabled, false);

    await provisionDefaultReminderSetup({
      workspaceId: WORKSPACE_A,
      plan: "pro",
      admin,
    });

    assert.equal(plusThree?.is_enabled, false);
    assert.equal(state.updateCount, 0);
  });

  it("D — Starter → Pro preserves existing disabled final", async () => {
    const state = createState();
    const admin = createMockAdmin(state);

    await provisionDefaultReminderSetup({
      workspaceId: WORKSPACE_A,
      plan: "starter",
      admin,
    });

    const finalRule = ruleForCode(state, WORKSPACE_A, "final");
    assert.equal(finalRule?.is_enabled, false);

    await provisionDefaultReminderSetup({
      workspaceId: WORKSPACE_A,
      plan: "pro",
      admin,
    });

    assert.equal(finalRule?.is_enabled, false);
    assert.equal(state.updateCount, 0);
  });

  it("E — Pro provisioning creates missing plus_3 enabled", async () => {
    const state = createState();
    const admin = createMockAdmin(state);

    await provisionDefaultReminderSetup({
      workspaceId: WORKSPACE_A,
      plan: "starter",
      admin,
    });

    const plusThreeTemplate = templateForCode(state, WORKSPACE_A, "plus_3");
    assert.ok(plusThreeTemplate);
    state.rules = state.rules.filter((r) => r.template_id !== plusThreeTemplate!.id);

    await provisionDefaultReminderSetup({
      workspaceId: WORKSPACE_A,
      plan: "pro",
      admin,
    });

    const recreated = ruleForCode(state, WORKSPACE_A, "plus_3");
    assert.equal(recreated?.is_enabled, true);
  });

  it("F — Pro provisioning creates missing final enabled", async () => {
    const state = createState();
    const admin = createMockAdmin(state);

    await provisionDefaultReminderSetup({
      workspaceId: WORKSPACE_A,
      plan: "starter",
      admin,
    });

    const finalTemplate = templateForCode(state, WORKSPACE_A, "final");
    assert.ok(finalTemplate);
    state.rules = state.rules.filter((r) => r.template_id !== finalTemplate!.id);

    await provisionDefaultReminderSetup({
      workspaceId: WORKSPACE_A,
      plan: "pro",
      admin,
    });

    const recreated = ruleForCode(state, WORKSPACE_A, "final");
    assert.equal(recreated?.is_enabled, true);
  });

  it("G — existing customized canonical rule is not modified", async () => {
    const state = createState();
    const templateId = "tpl-custom-0000-0000-0000-000000000001";
    state.templates.push({
      id: templateId,
      workspace_id: WORKSPACE_A,
      code: "plus_7",
      name: "User customized 7-day",
      subject: "User subject",
      body: "User body",
      is_enabled: true,
      sort_order: 4,
      channel: "email",
    });
    state.rules.push({
      id: "rule-custom-0000-0000-0000-000000000001",
      workspace_id: WORKSPACE_A,
      template_id: templateId,
      name: "User rule",
      trigger_type: "after_due",
      offset_days: 7,
      for_status: "any",
      is_enabled: false,
      sort_order: 4,
    });

    const admin = createMockAdmin(state);
    await provisionDefaultReminderSetup({
      workspaceId: WORKSPACE_A,
      plan: "pro",
      admin,
    });

    const plusSevenRule = state.rules.find((r) => r.template_id === templateId);
    assert.equal(plusSevenRule?.name, "User rule");
    assert.equal(plusSevenRule?.for_status, "any");
    assert.equal(plusSevenRule?.is_enabled, false);
    assert.equal(state.updateCount, 0);
  });

  it("H — existing customized template is not modified", async () => {
    const state = createState();
    state.templates.push({
      id: "tpl-existing-0000-0000-0000-000000000001",
      workspace_id: WORKSPACE_A,
      code: "pre_due",
      name: "Custom pre due name",
      subject: "Custom subject",
      body: "Custom body",
      is_enabled: true,
      sort_order: 1,
      channel: "email",
    });

    const admin = createMockAdmin(state);
    await provisionDefaultReminderSetup({
      workspaceId: WORKSPACE_A,
      plan: "pro",
      admin,
    });

    const preDueTemplate = templateForCode(state, WORKSPACE_A, "pre_due");
    assert.equal(preDueTemplate?.subject, "Custom subject");
    assert.equal(preDueTemplate?.body, "Custom body");
    assert.equal(preDueTemplate?.name, "Custom pre due name");
    assert.equal(state.updateCount, 0);
  });

  it("I — repeated Pro provisioning produces no updates or duplicates", async () => {
    const state = createState();
    const admin = createMockAdmin(state);

    await provisionDefaultReminderSetup({
      workspaceId: WORKSPACE_A,
      plan: "pro",
      admin,
    });
    const second = await provisionDefaultReminderSetup({
      workspaceId: WORKSPACE_A,
      plan: "pro",
      admin,
    });

    assert.equal(workspaceTemplates(state, WORKSPACE_A).length, 5);
    assert.equal(workspaceRules(state, WORKSPACE_A).length, 5);
    assert.equal(second.templatesCreated, 0);
    assert.equal(second.rulesCreated, 0);
    assert.equal(state.updateCount, 0);
  });

  it("J — empty Pro workspace repair (Banana Company scenario) remains valid", async () => {
    const state = createState();
    const admin = createMockAdmin(state);

    const result = await provisionDefaultReminderSetup({
      workspaceId: WORKSPACE_A,
      plan: "pro",
      admin,
    });

    assert.equal(result.templatesCreated, 5);
    assert.equal(result.rulesCreated, 5);
    assert.equal(workspaceTemplates(state, WORKSPACE_A).length, 5);
    assert.equal(workspaceRules(state, WORKSPACE_A).length, 5);

    const bindings = summarizeCanonicalRuleBindings(
      state.templates,
      state.rules,
      WORKSPACE_A
    );
    assert.deepEqual(new Set(bindings), new Set(CANONICAL_TEMPLATE_CODES));
    for (const rule of workspaceRules(state, WORKSPACE_A)) {
      assert.equal(rule.is_enabled, true);
    }
  });

  it("partial Pro repair creates missing rules enabled without touching existing config", async () => {
    const state = createState();
    const admin = createMockAdmin(state);

    await provisionDefaultReminderSetup({
      workspaceId: WORKSPACE_A,
      plan: "starter",
      admin,
    });

    const preDue = ruleForCode(state, WORKSPACE_A, "pre_due");
    const dueDay = ruleForCode(state, WORKSPACE_A, "due_day");
    const plusSevenTemplate = templateForCode(state, WORKSPACE_A, "plus_7");
    assert.ok(preDue && dueDay && plusSevenTemplate);

    preDue!.is_enabled = true;
    dueDay!.is_enabled = false;
    plusSevenTemplate!.subject = "Custom plus 7 subject";
    state.rules.find((r) => r.template_id === plusSevenTemplate!.id)!.name =
      "Custom plus 7 rule";
    state.rules.find((r) => r.template_id === plusSevenTemplate!.id)!.is_enabled = true;

    state.rules = state.rules.filter(
      (r) =>
        r.template_id !== templateForCode(state, WORKSPACE_A, "plus_3")?.id &&
        r.template_id !== templateForCode(state, WORKSPACE_A, "final")?.id
    );

    await provisionDefaultReminderSetup({
      workspaceId: WORKSPACE_A,
      plan: "pro",
      admin,
    });

    assert.equal(preDue?.is_enabled, true);
    assert.equal(dueDay?.is_enabled, false);
    assert.equal(plusSevenTemplate?.subject, "Custom plus 7 subject");
    assert.equal(
      state.rules.find((r) => r.template_id === plusSevenTemplate!.id)?.name,
      "Custom plus 7 rule"
    );
    assert.equal(ruleForCode(state, WORKSPACE_A, "plus_3")?.is_enabled, true);
    assert.equal(ruleForCode(state, WORKSPACE_A, "final")?.is_enabled, true);
    assert.equal(state.updateCount, 0);
  });

  it("cross-workspace isolation", async () => {
    const state = createState();
    const admin = createMockAdmin(state);

    await provisionDefaultReminderSetup({
      workspaceId: WORKSPACE_A,
      plan: "pro",
      admin,
    });
    await provisionDefaultReminderSetup({
      workspaceId: WORKSPACE_B,
      plan: "starter",
      admin,
    });

    for (const rule of workspaceRules(state, WORKSPACE_A)) {
      const template = state.templates.find((t) => t.id === rule.template_id);
      assert.equal(template?.workspace_id, WORKSPACE_A);
    }
  });

  it("canonical rules bind to reminder_templates ids", async () => {
    const state = createState();
    const admin = createMockAdmin(state);

    await provisionDefaultReminderSetup({
      workspaceId: WORKSPACE_A,
      plan: "pro",
      admin,
    });

    for (const rule of workspaceRules(state, WORKSPACE_A)) {
      const template = state.templates.find((t) => t.id === rule.template_id);
      assert.ok(template);
      assert.equal(template?.workspace_id, WORKSPACE_A);
      assert.ok(CANONICAL_TEMPLATE_CODES.includes(template!.code as never));
    }
  });
});

describe("integration wiring", () => {
  it("workspace bootstrap invokes provisioning helper", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");

    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../workspaces/ensureWorkspaceForUser.ts"),
      "utf8"
    );
    assert.match(source, /provisionDefaultReminderSetupSafe/);
    assert.doesNotMatch(source, /applyProUpgradeEnablement/);
  });

  it("plan change invokes provisioning without upgrade mutation", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");

    const setPlanSource = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../../billing/setWorkspacePlan.ts"),
      "utf8"
    );
    const provisionSource = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "../provisionDefaultSetup.ts"),
      "utf8"
    );

    assert.match(setPlanSource, /provisionDefaultReminderSetupSafe/);
    assert.doesNotMatch(setPlanSource, /previousPlan/);
    assert.doesNotMatch(provisionSource, /applyProUpgradeEnablement/);
    assert.doesNotMatch(provisionSource, /previousPlan/);
  });
});
