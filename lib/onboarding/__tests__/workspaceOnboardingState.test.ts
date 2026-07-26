import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  CAUGHT_UP_ACTIONS_EMPTY,
  CAUGHT_UP_COLLECTIONS_EMPTY,
  FIRST_RUN_ACTIONS_EMPTY,
  FIRST_RUN_COLLECTIONS_EMPTY,
  FIRST_RUN_DASHBOARD_INSIGHT,
  hasNeverEnteredCollectionsWorkflow,
  isWorkspaceFirstRun,
} from "@/lib/onboarding/workspaceOnboardingState";

describe("workspace onboarding zero-data helpers", () => {
  it("detects first-run workspace with no invoices", () => {
    assert.equal(isWorkspaceFirstRun({ invoiceCount: 0, sentInvoiceCount: 0 }), true);
    assert.equal(isWorkspaceFirstRun({ invoiceCount: 1, sentInvoiceCount: 0 }), false);
  });

  it("distinguishes never-entered collections from caught-up state", () => {
    assert.equal(
      hasNeverEnteredCollectionsWorkflow({ invoiceCount: 0, sentInvoiceCount: 0 }),
      true
    );
    assert.equal(
      hasNeverEnteredCollectionsWorkflow({ invoiceCount: 2, sentInvoiceCount: 1 }),
      false
    );
  });

  it("exports distinct first-run vs caught-up copy", () => {
    assert.notEqual(FIRST_RUN_ACTIONS_EMPTY.title, CAUGHT_UP_ACTIONS_EMPTY.title);
    assert.notEqual(FIRST_RUN_COLLECTIONS_EMPTY.message, CAUGHT_UP_COLLECTIONS_EMPTY.message);
    assert.match(FIRST_RUN_DASHBOARD_INSIGHT.detail, /send/i);
  });
});
