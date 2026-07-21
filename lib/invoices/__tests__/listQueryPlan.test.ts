import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  buildDisplayStatusFilterPredicate,
  invoiceListViewAppliesCountFilters,
  normalizeInvoiceListStatusParam,
  resolveInvoiceListDisplayStatusFilter,
  shouldReuseAnyInvoicesCountAsFilteredCount,
} from "../listQueryPlan";

describe("shouldReuseAnyInvoicesCountAsFilteredCount", () => {
  it("returns true for default active tab with no filters", () => {
    assert.equal(
      shouldReuseAnyInvoicesCountAsFilteredCount({
        status: "all",
        search: "",
        view: "default",
      }),
      true
    );
    assert.equal(
      shouldReuseAnyInvoicesCountAsFilteredCount({
        status: "all",
        search: "",
        view: "overdue-first",
      }),
      true
    );
  });

  it("returns false when status, search, smart view, or archived tab differ", () => {
    assert.equal(
      shouldReuseAnyInvoicesCountAsFilteredCount({
        status: "draft",
        search: "",
        view: "default",
      }),
      false
    );
    assert.equal(
      shouldReuseAnyInvoicesCountAsFilteredCount({
        status: "all",
        search: "acme",
        view: "default",
      }),
      false
    );
    assert.equal(
      shouldReuseAnyInvoicesCountAsFilteredCount({
        status: "all",
        search: "",
        view: "smart-high-risk",
      }),
      false
    );
    assert.equal(
      shouldReuseAnyInvoicesCountAsFilteredCount({
        status: "archived",
        search: "",
        view: "default",
      }),
      false
    );
  });

  it("returns false for Partially Paid (status=partial)", () => {
    assert.equal(
      shouldReuseAnyInvoicesCountAsFilteredCount({
        status: "partial",
        search: "",
        view: "default",
      }),
      false
    );
  });

  it("documents smart views apply extra count filters", () => {
    assert.equal(invoiceListViewAppliesCountFilters("default"), false);
    assert.equal(invoiceListViewAppliesCountFilters("smart-low-risk"), true);
  });
});

describe("normalizeInvoiceListStatusParam", () => {
  it("accepts partial and partially_paid URL values", () => {
    assert.equal(normalizeInvoiceListStatusParam("partial"), "partial");
    assert.equal(normalizeInvoiceListStatusParam("partially_paid"), "partial");
    assert.equal(normalizeInvoiceListStatusParam("PARTIALLY_PAID"), "partial");
  });

  it("falls back unknown values to all", () => {
    assert.equal(normalizeInvoiceListStatusParam(null), "all");
    assert.equal(normalizeInvoiceListStatusParam("unknown"), "all");
  });
});

describe("Partially Paid filter construction", () => {
  it("maps status=partial to canonical display_status eq partially_paid", () => {
    const status = normalizeInvoiceListStatusParam("partial");
    const displayStatus = resolveInvoiceListDisplayStatusFilter(status);
    assert.equal(displayStatus, "partially_paid");

    const predicate = buildDisplayStatusFilterPredicate(displayStatus!);
    assert.equal(predicate.kind, "eq");
    if (predicate.kind === "eq") {
      assert.equal(predicate.column, "display_status");
      assert.equal(predicate.value, "partially_paid");
    }
  });

  it("maps status=partially_paid to the same Partially Paid path", () => {
    const status = normalizeInvoiceListStatusParam("partially_paid");
    assert.equal(status, "partial");

    const displayStatus = resolveInvoiceListDisplayStatusFilter(status);
    assert.equal(displayStatus, "partially_paid");

    const predicate = buildDisplayStatusFilterPredicate(displayStatus!);
    assert.equal(predicate.kind, "eq");
    if (predicate.kind === "eq") {
      assert.equal(predicate.value, "partially_paid");
    }
  });

  it("does not include legacy Partially Paid OR branch", () => {
    const predicate = buildDisplayStatusFilterPredicate("partially_paid");
    const serialized = JSON.stringify(predicate);
    assert.doesNotMatch(serialized, /Partially Paid/);
    assert.doesNotMatch(serialized, /\.or\(/);
  });

  it("preserves legacy OR predicates for other display-status tabs", () => {
    const paidPredicate = buildDisplayStatusFilterPredicate("paid");
    assert.equal(paidPredicate.kind, "or");
    if (paidPredicate.kind === "or") {
      assert.match(paidPredicate.expression, /display_status\.eq\.paid,display_status\.eq\.Paid/);
    }

    const overduePredicate = buildDisplayStatusFilterPredicate("overdue");
    assert.equal(overduePredicate.kind, "or");
  });
});

describe("invoice list loader integration", () => {
  it("uses Promise.all for rows and count execution", () => {
    const source = readFileSync(
      path.join(process.cwd(), "app", "[workspaceId]", "invoices", "page.tsx"),
      "utf8"
    );
    assert.match(source, /reuseAnyInvoicesCountAsFilteredCount/);
    assert.match(source, /Promise\.all\(\[\s*\n\s*perfTime\([\s\S]*"invoiceRows"/);
    assert.match(source, /anyInvoicesCount=reused count=/);
  });
});
