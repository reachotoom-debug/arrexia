import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { buildAuthCallbackUrl } from "@/lib/config/appUrl";

describe("auth callback plan preservation", () => {
  it("includes allowlisted plan in callback URL and rejects enterprise", () => {
    const starter = buildAuthCallbackUrl({
      origin: "https://arrexia.app",
      plan: "starter",
    });
    assert.ok(starter?.includes("plan=starter"));

    const rejected = buildAuthCallbackUrl({
      origin: "https://arrexia.app",
      plan: "enterprise",
    });
    assert.ok(rejected);
    assert.doesNotMatch(rejected!, /plan=/);
  });
});

describe("R5 P3 client mutation tenancy", () => {
  for (const fnName of ["toggleClientActive", "archiveClient", "unarchiveClient"] as const) {
    it(`${fnName} requires workspace membership before update`, () => {
      const src = readFileSync("app/[workspaceId]/clients/actions.ts", "utf8");
      const fnStart = src.indexOf(`export async function ${fnName}`);
      assert.ok(fnStart >= 0, `${fnName} not found`);

      const nextFn = src.indexOf("export async function", fnStart + 1);
      const block = src.slice(fnStart, nextFn > fnStart ? nextFn : undefined);

      assert.match(block, /requireWorkspace\(workspaceId\)/);
      assert.match(block, /\.eq\("workspace_id", validatedWorkspaceId\)/);
      assert.match(block, /\.eq\("id", clientId\)/);
    });
  }

  it("unarchiveClient does not force is_active true", () => {
    const src = readFileSync("app/[workspaceId]/clients/actions.ts", "utf8");
    const fnStart = src.indexOf("export async function unarchiveClient");
    const nextFn = src.indexOf("export async function", fnStart + 1);
    const block = src.slice(fnStart, nextFn > fnStart ? nextFn : undefined);

    assert.doesNotMatch(block, /is_active:\s*true/);
    assert.match(block, /archived_at:\s*null/);
  });
});

describe("R5 P2 invoice draft default unchanged", () => {
  it("create-mode InvoiceForm still defaults status to draft", () => {
    const src = readFileSync(
      "app/[workspaceId]/invoices/_components/InvoiceForm.tsx",
      "utf8"
    );
    assert.match(src, /status:\s*"draft"/);
    assert.match(src, /setSubmitMode\("draft"\)/);
    assert.match(src, /if \(submitMode === "draft"\)/);
    assert.match(src, /else if \(submitMode === "sent"\)/);
  });
});

describe("R5 P3 effective plan centralization", () => {
  it("getWorkspacePlan applies resolveEffectiveWorkspacePlan", () => {
    const src = readFileSync("lib/billing/getWorkspacePlan.ts", "utf8");
    assert.match(src, /resolveEffectiveWorkspacePlan/);
    assert.match(src, /loadWorkspaceSubscription/);
  });

  it("assertWithinPlanLimits uses getWorkspacePlan for enforcement", () => {
    const src = readFileSync("lib/billing/assertWithinPlanLimits.ts", "utf8");
    assert.match(src, /getWorkspacePlan/);
  });
});
