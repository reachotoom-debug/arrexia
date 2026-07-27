import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { resolveCustomerFacingBusinessName } from "@/lib/branding/resolveCustomerFacingBusinessName";

const DAILY_ACTION_CELL = "app/[workspaceId]/actions/_components/CollectionActionCell.tsx";
const COLLECTIONS_PAGE = "app/[workspaceId]/collections/page.tsx";
const COLLECTIONS_TABLE = "app/[workspaceId]/collections/_components/CollectionsTable.tsx";
const DASHBOARD_COLLECTIONS_TAB =
  "app/[workspaceId]/dashboard/_components/CollectionsModeTab.tsx";
const DASHBOARD_DATA_LOADER = "app/[workspaceId]/dashboard/_utils/dataLoader.ts";
const DAILY_ACTION_LOADER = "lib/actions/getDailyActionCenterData.ts";

describe("resolveCustomerFacingBusinessName", () => {
  it("prefers branding legal name over workspace placeholders", () => {
    assert.equal(
      resolveCustomerFacingBusinessName({
        brandingBusinessLegalName: "FlowCollect LLC",
        businessName: "FlowCollect",
        workspaceDisplayName: "My Workspace",
        workspaceName: "My Workspace",
      }),
      "FlowCollect LLC"
    );
  });

  it("skips placeholder workspace name and falls back to Your company", () => {
    assert.equal(
      resolveCustomerFacingBusinessName({
        brandingBusinessLegalName: null,
        businessName: null,
        workspaceDisplayName: null,
        workspaceName: "My Workspace",
      }),
      "Your company"
    );
  });

  it("uses meaningful workspace name before generic fallback", () => {
    assert.equal(
      resolveCustomerFacingBusinessName({
        brandingBusinessLegalName: null,
        businessName: null,
        workspaceDisplayName: null,
        workspaceName: "Acme Collections",
      }),
      "Acme Collections"
    );
  });
});

describe("WhatsApp integration contract", () => {
  it("Daily Action Center uses shared WhatsAppCollectionLink with country and business name", () => {
    const cellSrc = readFileSync(DAILY_ACTION_CELL, "utf8");
    const loaderSrc = readFileSync(DAILY_ACTION_LOADER, "utf8");

    assert.match(cellSrc, /WhatsAppCollectionLink/);
    assert.match(cellSrc, /clientCountry/);
    assert.match(cellSrc, /businessName/);
    assert.doesNotMatch(cellSrc, /wa\.me/);
    assert.match(loaderSrc, /country/);
    assert.match(loaderSrc, /resolveCustomerFacingBusinessName/);
    assert.match(loaderSrc, /businessName/);
  });

  it("Collections uses shared WhatsAppCollectionLink with business name", () => {
    const pageSrc = readFileSync(COLLECTIONS_PAGE, "utf8");
    const tableSrc = readFileSync(COLLECTIONS_TABLE, "utf8");

    assert.match(pageSrc, /WhatsAppCollectionLink/);
    assert.match(pageSrc, /loadCustomerFacingBusinessName/);
    assert.match(pageSrc, /clientCountry/);
    assert.match(tableSrc, /WhatsAppCollectionLink/);
    assert.match(tableSrc, /businessName/);
    assert.doesNotMatch(pageSrc, /wa\.me/);
    assert.doesNotMatch(tableSrc, /wa\.me/);
  });

  it("Dashboard CollectionsModeTab passes resolved businessName to CollectionsTable", () => {
    const tabSrc = readFileSync(DASHBOARD_COLLECTIONS_TAB, "utf8");
    const loaderSrc = readFileSync(DASHBOARD_DATA_LOADER, "utf8");

    assert.match(tabSrc, /businessName=\{data\.businessName\}/);
    assert.match(loaderSrc, /resolveCustomerFacingBusinessName/);
    assert.match(loaderSrc, /businessName,/);
  });
});
