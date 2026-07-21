import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  decideAdminAccess,
  shouldRunAdminInfrastructureProbes,
} from "../adminAccessPlan";

const infrastructureInstalled = {
  adminUsersTableInstalled: true,
  adminAuditLogsTableInstalled: true,
  workspaceSubscriptionsTableInstalled: true,
  adminUsersCount: 2,
};

const infrastructureMissingTable = {
  adminUsersTableInstalled: false,
  adminAuditLogsTableInstalled: false,
  workspaceSubscriptionsTableInstalled: false,
  adminUsersCount: 0,
};

const infrastructureBootstrap = {
  ...infrastructureInstalled,
  adminUsersCount: 0,
};

describe("shouldRunAdminInfrastructureProbes", () => {
  it("skips infrastructure probes when a direct admin record exists", () => {
    assert.equal(
      shouldRunAdminInfrastructureProbes({
        id: "admin-1",
        user_id: "user-1",
        role: "admin",
        created_by: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      }),
      false
    );
    assert.equal(shouldRunAdminInfrastructureProbes(null), true);
  });
});

describe("decideAdminAccess", () => {
  it("authorizes existing admin records without fallback", () => {
    const result = decideAdminAccess({
      user: { id: "user-1", email: "admin@example.com" },
      record: {
        id: "admin-1",
        user_id: "user-1",
        role: "super_admin",
        created_by: null,
        created_at: "2026-01-01T00:00:00.000Z",
        updated_at: "2026-01-01T00:00:00.000Z",
      },
      infrastructure: infrastructureInstalled,
      emergencyFallbackEnabled: false,
      isAdminEmailAllowed: () => false,
    });

    assert.equal(result.authorized, true);
    if (result.authorized) {
      assert.equal(result.accessMode, "db_admin");
      assert.equal(result.role, "super_admin");
      assert.equal(result.tablesMissing, false);
    }
  });

  it("keeps non-admin users unauthorized", () => {
    const result = decideAdminAccess({
      user: { id: "user-2", email: "user@example.com" },
      record: null,
      infrastructure: infrastructureInstalled,
      emergencyFallbackEnabled: false,
      isAdminEmailAllowed: () => false,
    });

    assert.deepEqual(result, { authorized: false, reason: "unauthorized" });
  });

  it("preserves bootstrap allowlist behavior when admin table is empty", () => {
    const allowed = decideAdminAccess({
      user: { id: "founder-1", email: "founder@example.com" },
      record: null,
      infrastructure: infrastructureBootstrap,
      emergencyFallbackEnabled: false,
      isAdminEmailAllowed: (email) => email === "founder@example.com",
    });
    assert.equal(allowed.authorized, true);
    if (allowed.authorized) {
      assert.equal(allowed.accessMode, "bootstrap_pending");
      assert.equal(allowed.bootstrapAllowed, true);
    }

    const denied = decideAdminAccess({
      user: { id: "user-3", email: "other@example.com" },
      record: null,
      infrastructure: infrastructureBootstrap,
      emergencyFallbackEnabled: false,
      isAdminEmailAllowed: () => false,
    });
    assert.deepEqual(denied, { authorized: false, reason: "unauthorized" });
  });

  it("preserves missing-table and emergency fallback behavior", () => {
    const missingTable = decideAdminAccess({
      user: { id: "founder-1", email: "founder@example.com" },
      record: null,
      infrastructure: infrastructureMissingTable,
      emergencyFallbackEnabled: false,
      isAdminEmailAllowed: (email) => email === "founder@example.com",
    });
    assert.equal(missingTable.authorized, true);
    if (missingTable.authorized) {
      assert.equal(missingTable.accessMode, "tables_missing_fallback");
      assert.equal(missingTable.tablesMissing, true);
    }

    const emergency = decideAdminAccess({
      user: { id: "founder-1", email: "founder@example.com" },
      record: null,
      infrastructure: infrastructureInstalled,
      emergencyFallbackEnabled: true,
      isAdminEmailAllowed: (email) => email === "founder@example.com",
    });
    assert.equal(emergency.authorized, true);
    if (emergency.authorized) {
      assert.equal(emergency.accessMode, "emergency_fallback");
      assert.equal(emergency.emergencyFallback, true);
    }
  });
});

describe("requireAdmin hot path", () => {
  it("looks up admin record before infrastructure fallback probes", () => {
    const source = readFileSync(
      path.join(process.cwd(), "lib", "admin", "requireAdmin.ts"),
      "utf8"
    );
    const fnStart = source.indexOf("async function resolveAdminAccessForUser");
    const fnBody = source.slice(fnStart, fnStart + 1200);
    assert.match(fnBody, /const record = await getAdminUserRecord\(user\.id\)/);
    assert.match(fnBody, /shouldRunAdminInfrastructureProbes\(record\)/);
    assert.match(fnBody, /adminInfrastructureFallback/);
    assert.doesNotMatch(
      fnBody,
      /const infrastructure = await getAdminInfrastructureStatus\(\);\s*const record = await getAdminUserRecord/
    );
  });
});
