import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";

import {
  invoiceListViewAppliesCountFilters,
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

  it("documents smart views apply extra count filters", () => {
    assert.equal(invoiceListViewAppliesCountFilters("default"), false);
    assert.equal(invoiceListViewAppliesCountFilters("smart-low-risk"), true);
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
