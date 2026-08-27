import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  aggregateClientInvoiceMetrics,
  canUseFilteredCountAsWorkspaceTotal,
  isComputedClientSortKey,
  mapClientSortKeyToDbColumn,
  needsClientInvoiceAggregation,
  shouldReusePageInvoiceMetricsFromLoadClients,
  sortClientsByComputedKey,
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
  it("returns true only for default client view without computed sort", () => {
    assert.equal(
      shouldReusePageInvoiceMetricsFromLoadClients({ view: "default" }),
      true
    );
    assert.equal(
      shouldReusePageInvoiceMetricsFromLoadClients({ view: "default", sort: "client_name" }),
      true
    );
    assert.equal(
      shouldReusePageInvoiceMetricsFromLoadClients({ view: "default", sort: "outstanding" }),
      false
    );
    assert.equal(
      shouldReusePageInvoiceMetricsFromLoadClients({ view: "highest-outstanding-first" }),
      false
    );
  });
});

describe("client outstanding sort query plan", () => {
  it("A — outstanding ascending sorts lowest balances first", () => {
    const clients = [
      { id: "b", outstanding: 200 },
      { id: "a", outstanding: 50 },
      { id: "c", outstanding: 100 },
    ];
    const sorted = sortClientsByComputedKey(clients, "outstanding", "asc");
    assert.deepEqual(sorted.map((c) => c.id), ["a", "c", "b"]);
  });

  it("B — outstanding descending sorts highest balances first", () => {
    const clients = [
      { id: "b", outstanding: 200 },
      { id: "a", outstanding: 50 },
      { id: "c", outstanding: 100 },
    ];
    const sorted = sortClientsByComputedKey(clients, "outstanding", "desc");
    assert.deepEqual(sorted.map((c) => c.id), ["b", "c", "a"]);
  });

  it("C — zero outstanding sorts deterministically before positive balances (asc)", () => {
    const clients = [
      { id: "paid", outstanding: 0 },
      { id: "due", outstanding: 75 },
    ];
    const sorted = sortClientsByComputedKey(clients, "outstanding", "asc");
    assert.deepEqual(sorted.map((c) => c.id), ["paid", "due"]);
  });

  it("D — null/undefined outstanding treated as zero", () => {
    const clients = [
      { id: "missing", outstanding: undefined },
      { id: "zero", outstanding: 0 },
      { id: "due", outstanding: 10 },
    ];
    const sorted = sortClientsByComputedKey(clients, "outstanding", "asc");
    assert.deepEqual(sorted.map((c) => c.id), ["missing", "zero", "due"]);
  });

  it("E — partially paid client outstanding is summed correctly", () => {
    const metrics = aggregateClientInvoiceMetrics([
      {
        client_id: "partial",
        display_status: "sent",
        risk_level: null,
        outstanding: 40,
      },
    ]);
    assert.equal(metrics.get("partial")?.outstandingSum, 40);
  });

  it("F — multiple invoices per client aggregate outstanding", () => {
    const metrics = aggregateClientInvoiceMetrics([
      {
        client_id: "multi",
        display_status: "sent",
        risk_level: null,
        outstanding: 100,
      },
      {
        client_id: "multi",
        display_status: "overdue",
        risk_level: "high",
        outstanding: 25,
      },
    ]);
    assert.equal(metrics.get("multi")?.outstandingSum, 125);
    assert.equal(metrics.get("multi")?.invoiceCount, 2);
    assert.equal(metrics.get("multi")?.isOverdue, true);
  });

  it("G — aggregation keys by client_id only (tenant rows stay isolated per workspace query)", () => {
    const metrics = aggregateClientInvoiceMetrics([
      {
        client_id: "ws-a-client",
        display_status: "sent",
        risk_level: null,
        outstanding: 10,
      },
      {
        client_id: "ws-b-client",
        display_status: "sent",
        risk_level: null,
        outstanding: 99,
      },
    ]);
    assert.equal(metrics.get("ws-a-client")?.outstandingSum, 10);
    assert.equal(metrics.get("ws-b-client")?.outstandingSum, 99);
    assert.equal(metrics.size, 2);
  });

  it("H — pagination after global outstanding sort preserves workspace-wide order", () => {
    const clients = [
      { id: "1", outstanding: 500 },
      { id: "2", outstanding: 300 },
      { id: "3", outstanding: 100 },
      { id: "4", outstanding: 0 },
    ];
    const sorted = sortClientsByComputedKey(clients, "outstanding", "desc");
    const pageSize = 2;
    const page1 = sorted.slice(0, pageSize);
    const page2 = sorted.slice(pageSize, pageSize * 2);
    assert.deepEqual(page1.map((c) => c.id), ["1", "2"]);
    assert.deepEqual(page2.map((c) => c.id), ["3", "4"]);
  });

  it("I — native client sort keys still map to clients table columns", () => {
    assert.equal(mapClientSortKeyToDbColumn("client_name"), "name");
    assert.equal(mapClientSortKeyToDbColumn("status"), "status");
    assert.equal(mapClientSortKeyToDbColumn("created_at"), "created_at");
    assert.equal(isComputedClientSortKey("outstanding"), true);
    assert.equal(mapClientSortKeyToDbColumn("outstanding"), null);
  });

  it("J — computed outstanding sort triggers invoice aggregation instead of SQL order", () => {
    assert.equal(
      needsClientInvoiceAggregation({ view: "default", sort: "outstanding" }),
      true
    );
    assert.equal(
      needsClientInvoiceAggregation({ view: "default", sort: "client_name" }),
      false
    );
    assert.equal(isComputedClientSortKey("not-a-sort" as "outstanding"), false);
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

  it("does not order clients relation by nonexistent outstanding column", () => {
    const source = readFileSync(
      path.join(process.cwd(), "app", "[workspaceId]", "clients", "page.tsx"),
      "utf8"
    );
    assert.match(source, /mapClientSortKeyToDbColumn/);
    assert.match(source, /sortClientsByComputedKey/);
    assert.match(source, /needsClientInvoiceAggregation/);
    assert.doesNotMatch(source, /\.order\("outstanding"/);
    assert.match(source, /\.eq\("workspace_id", workspaceId\)/);
  });

  it("logs server-side load failures without exposing raw errors in UI", () => {
    const source = readFileSync(
      path.join(process.cwd(), "app", "[workspaceId]", "clients", "page.tsx"),
      "utf8"
    );
    assert.match(source, /failed to load clients \(Supabase error\)/);
    assert.match(source, /failed to render clients page/);
    assert.match(source, /Unable to load clients/);
  });
});
