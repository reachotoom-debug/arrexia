import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { resolveHonoredNextPath, sanitizeNextPath } from "../safeNextPath";

const WORKSPACE_ID = "11111111-1111-1111-1111-111111111111";
const OTHER_WORKSPACE_ID = "22222222-2222-2222-2222-222222222222";

describe("sanitizeNextPath", () => {
  it("Test 12 — rejects external or malformed next values", () => {
    assert.equal(sanitizeNextPath("https://evil.example/phish"), null);
    assert.equal(sanitizeNextPath("//evil.example/phish"), null);
    assert.equal(sanitizeNextPath("\\evil"), null);
    assert.equal(sanitizeNextPath(null), null);
  });
});

describe("resolveHonoredNextPath", () => {
  it("Test 11 — preserves safe internal next after workspace resolution", () => {
    const next = `/${WORKSPACE_ID}/clients`;
    const honored = resolveHonoredNextPath(next, [WORKSPACE_ID]);

    assert.equal(honored, next);
  });

  it("rejects next for a workspace the user does not belong to", () => {
    const honored = resolveHonoredNextPath(`/${OTHER_WORKSPACE_ID}/dashboard`, [WORKSPACE_ID]);
    assert.equal(honored, null);
  });

  it("allows admin paths without workspace membership", () => {
    const honored = resolveHonoredNextPath("/admin/users", []);
    assert.equal(honored, "/admin/users");
  });
});
