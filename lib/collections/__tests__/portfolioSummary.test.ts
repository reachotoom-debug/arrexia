import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  COLLECTIONS_ESCALATION_MIN_OUTSTANDING,
  COLLECTIONS_ESCALATION_MIN_OVERDUE_DAYS,
  computePortfolioExposureByCurrency,
  formatPortfolioExposureLabel,
  shouldRecommendEscalation,
} from "@/lib/collections/portfolioSummary";

const COLLECTIONS_PAGE = "app/[workspaceId]/collections/page.tsx";
const PORTFOLIO_ACTION_CELL =
  "app/[workspaceId]/collections/_components/CollectionsPortfolioActionCell.tsx";

describe("Collections portfolio summary (Task 3)", () => {
  it("A — portfolio query remains overdue + outstanding scoped, not Action Center triggers", () => {
    const src = readFileSync(COLLECTIONS_PAGE, "utf8");

    assert.match(src, /\.eq\("is_overdue", true\)/);
    assert.match(src, /\.gt\("outstanding", 0\)/);
    assert.doesNotMatch(src, /reminder_due/);
    assert.doesNotMatch(src, /buildDailyActionCategories/);
    assert.doesNotMatch(src, /getEligibleReminders/);
  });

  it("B — risk filtering query path is unchanged", () => {
    const src = readFileSync(COLLECTIONS_PAGE, "utf8");

    assert.match(src, /risk !== "all"/);
    assert.match(src, /\.eq\("risk_level", risk\)/);
  });

  it("C — escalation semantics unchanged", () => {
    assert.equal(shouldRecommendEscalation(29, 6000), false);
    assert.equal(shouldRecommendEscalation(30, 4999), false);
    assert.equal(shouldRecommendEscalation(30, 5000), true);
    assert.equal(shouldRecommendEscalation(45, 12000), true);
    assert.equal(COLLECTIONS_ESCALATION_MIN_OVERDUE_DAYS, 30);
    assert.equal(COLLECTIONS_ESCALATION_MIN_OUTSTANDING, 5000);
  });

  it("D — outstanding exposure uses remaining balance values", () => {
    const totals = computePortfolioExposureByCurrency([
      { outstanding: 250, currency: "USD" },
      { outstanding: 100, currency: "USD" },
    ]);

    assert.deepEqual(totals, [{ currency: "USD", amount: 350 }]);
  });

  it("E — multi-currency portfolio total is not incorrectly combined", () => {
    const totals = computePortfolioExposureByCurrency([
      { outstanding: 1000, currency: "USD" },
      { outstanding: 2000, currency: "EUR" },
    ]);

    assert.deepEqual(totals, [
      { currency: "EUR", amount: 2000 },
      { currency: "USD", amount: 1000 },
    ]);

    const label = formatPortfolioExposureLabel(totals);
    assert.match(label.value, /\$/);
    assert.match(label.value, /€/);
    assert.match(label.value, /·/);
    assert.equal(label.detail, "Totals shown separately by currency.");
  });

  it("F — primary portfolio action remains available", () => {
    const src = readFileSync(PORTFOLIO_ACTION_CELL, "utf8");
    assert.match(src, /View account/);
  });

  it("G — WhatsApp and AI still use shared components when retained", () => {
    const src = readFileSync(PORTFOLIO_ACTION_CELL, "utf8");
    assert.match(src, /WhatsAppCollectionLink/);
    assert.match(src, /AiCollectionAssistDialog/);
  });

  it("H — Collections does not duplicate Send Reminder logic", () => {
    const pageSrc = readFileSync(COLLECTIONS_PAGE, "utf8");
    const cellSrc = readFileSync(PORTFOLIO_ACTION_CELL, "utf8");

    assert.doesNotMatch(pageSrc, /SendReminderButton/);
    assert.doesNotMatch(pageSrc, /sendReminderAction/);
    assert.doesNotMatch(cellSrc, /SendReminderButton/);
    assert.doesNotMatch(cellSrc, /sendReminderAction/);
  });

  it("I — Action Center navigation remains present", () => {
    const src = readFileSync(COLLECTIONS_PAGE, "utf8");
    assert.match(src, /\/actions/);
    assert.match(src, /Action Center/);
  });

  it("J — no fabricated Last Contact or Attempts fields", () => {
    const src = readFileSync(COLLECTIONS_PAGE, "utf8");
    assert.doesNotMatch(src, /last.?contact/i);
    assert.doesNotMatch(src, /attempt.?count/i);
    assert.doesNotMatch(src, /Last email reminder/i);
  });
});
