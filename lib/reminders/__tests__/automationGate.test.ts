import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  automationGateSkipMessage,
  evaluateAutomationGate,
  loadAutomationGateForWorkspace,
} from "../automationGate";

describe("evaluateAutomationGate (R2F)", () => {
  it("A/C/E — false, null, and undefined fail closed", () => {
    const falseResult = evaluateAutomationGate(false);
    assert.equal(falseResult.allowed, false);
    if (!falseResult.allowed) {
      assert.equal(falseResult.skipReason, "automation_disabled");
    }

    const nullResult = evaluateAutomationGate(null);
    assert.equal(nullResult.allowed, false);
    if (!nullResult.allowed) {
      assert.equal(nullResult.skipReason, "automation_null");
    }

    const undefinedResult = evaluateAutomationGate(undefined);
    assert.equal(undefinedResult.allowed, false);
    if (!undefinedResult.allowed) {
      assert.equal(undefinedResult.skipReason, "automation_null");
    }
  });

  it("allows automatic sending only when explicitly true", () => {
    assert.deepEqual(evaluateAutomationGate(true), { allowed: true });
  });
});

describe("loadAutomationGateForWorkspace (R2F)", () => {
  it("C — missing settings row fails closed", async () => {
    const supabase = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({ data: null, error: null }),
        };
      },
    };

    const result = await loadAutomationGateForWorkspace(
      supabase as never,
      "ws-missing"
    );
    assert.equal(result.allowed, false);
    if (result.allowed) return;
    assert.equal(result.skipReason, "settings_missing");
  });

  it("D — settings query error fails closed", async () => {
    const supabase = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({
            data: null,
            error: { message: "db down", code: "500" },
          }),
        };
      },
    };

    const result = await loadAutomationGateForWorkspace(
      supabase as never,
      "ws-error"
    );
    assert.equal(result.allowed, false);
    if (result.allowed) return;
    assert.equal(result.skipReason, "settings_query_failed");
  });

  it("E — null auto_send_reminders fails closed", async () => {
    const supabase = {
      from() {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          maybeSingle: async () => ({
            data: { auto_send_reminders: null },
            error: null,
          }),
        };
      },
    };

    const result = await loadAutomationGateForWorkspace(
      supabase as never,
      "ws-null"
    );
    assert.equal(result.allowed, false);
    if (result.allowed) return;
    assert.equal(result.skipReason, "automation_null");
  });
});

describe("automationGateSkipMessage", () => {
  it("returns human-readable skip reasons", () => {
    assert.match(
      automationGateSkipMessage("automation_disabled"),
      /disabled/i
    );
    assert.match(automationGateSkipMessage("settings_query_failed"), /Failed to load/i);
  });
});
