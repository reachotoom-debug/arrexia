import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  canUseFilteredCountAsWorkspaceTotal,
  shouldReusePageInvoiceMetricsFromLoadClients,
} from "../listQueryPlan";

describe("canUseFilteredCountAsWorkspaceTotal", () => {
  it("returns true only for unfiltered workspace-wide client list", () => {
    assert.equal(
      canUseFilteredCountAsWorkspaceTotal({ status: "all", q: "" }),
      true
    );
    assert.equal(
      canUseFilteredCountAsWorkspaceTotal({ status: "active", q: "" }),
      false
    );
    assert.equal(
      canUseFilteredCountAsWorkspaceTotal({ status: "all", q: "acme" }),
      false
    );
  });
});

describe("shouldReusePageInvoiceMetricsFromLoadClients", () => {
  it("returns true only for default client view", () => {
    assert.equal(
      shouldReusePageInvoiceMetricsFromLoadClients({ view: "default" }),
      true
    );
    assert.equal(
      shouldReusePageInvoiceMetricsFromLoadClients({ view: "highest-outstanding-first" }),
      false
    );
  });
});

describe("clients page integration", () => {
  it("reuses loadClients invoice metrics instead of duplicate page query", () => {
    const source = readFileSync(
      path.join(process.cwd(), "app", "[workspaceId]", "clients", "page.tsx"),
      "utf8"
    );
    assert.match(source, /pageInvoiceMetrics/);
    assert.match(source, /invoicesViewForPageClients=reused rows=/);
    assert.match(source, /allClientsCount=reused count=/);
  });
});
