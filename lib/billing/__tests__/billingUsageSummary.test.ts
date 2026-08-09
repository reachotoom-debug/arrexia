import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildBillingUsageMeters } from "@/lib/billing/buildBillingUsageMeters";
import {
  TRIAL_AUTOMATED_REMINDER_LIMIT,
  TRIAL_CLIENT_LIMIT,
  TRIAL_INVOICE_LIMIT_TOTAL,
  TRIAL_AI_GENERATION_LIMIT,
  TRIAL_MANUAL_EMAIL_REMINDER_LIMIT,
} from "@/lib/billing/trialConfig";

describe("buildBillingUsageMeters", () => {
  it("trial clients usage/50", () => {
    const meters = buildBillingUsageMeters({
      entitlementState: "trial",
      clientUsage: { activeClientCount: 10, clientLimit: TRIAL_CLIENT_LIMIT },
      invoiceUsage: { used: 0, limit: TRIAL_INVOICE_LIMIT_TOTAL },
      entitlementUsage: {
        workspace_id: "ws",
        trial_invoices_created: 0,
        ai_generations_successful: 0,
        automated_reminders_sent: 0,
        manual_email_reminders_sent: 0,
      },
    });
    const clients = meters.find((meter) => meter.id === "clients");
    assert.equal(clients?.used, 10);
    assert.equal(clients?.limit, 50);
  });

  it("trial invoices usage/75 lifetime", () => {
    const meters = buildBillingUsageMeters({
      entitlementState: "trial",
      clientUsage: { activeClientCount: 0, clientLimit: TRIAL_CLIENT_LIMIT },
      invoiceUsage: { used: 20, limit: TRIAL_INVOICE_LIMIT_TOTAL },
      entitlementUsage: {
        workspace_id: "ws",
        trial_invoices_created: 20,
        ai_generations_successful: 0,
        automated_reminders_sent: 0,
        manual_email_reminders_sent: 0,
      },
    });
    const invoices = meters.find((meter) => meter.id === "invoices");
    assert.equal(invoices?.used, 20);
    assert.equal(invoices?.limit, 75);
    assert.equal(invoices?.periodType, "trial_lifetime");
    assert.match(invoices?.periodLabel ?? "", /does not reset/);
  });

  it("trial AI usage/50", () => {
    const meters = buildBillingUsageMeters({
      entitlementState: "trial",
      clientUsage: { activeClientCount: 0, clientLimit: TRIAL_CLIENT_LIMIT },
      invoiceUsage: { used: 0, limit: TRIAL_INVOICE_LIMIT_TOTAL },
      entitlementUsage: {
        workspace_id: "ws",
        trial_invoices_created: 0,
        ai_generations_successful: 12,
        automated_reminders_sent: 0,
        manual_email_reminders_sent: 0,
      },
    });
    const ai = meters.find((meter) => meter.id === "ai");
    assert.equal(ai?.used, 12);
    assert.equal(ai?.limit, TRIAL_AI_GENERATION_LIMIT);
  });

  it("trial automated reminders/75", () => {
    const meters = buildBillingUsageMeters({
      entitlementState: "trial",
      clientUsage: { activeClientCount: 0, clientLimit: TRIAL_CLIENT_LIMIT },
      invoiceUsage: { used: 0, limit: TRIAL_INVOICE_LIMIT_TOTAL },
      entitlementUsage: {
        workspace_id: "ws",
        trial_invoices_created: 0,
        ai_generations_successful: 0,
        automated_reminders_sent: 30,
        manual_email_reminders_sent: 0,
      },
    });
    const reminders = meters.find((meter) => meter.id === "automated_reminders");
    assert.equal(reminders?.used, 30);
    assert.equal(reminders?.limit, TRIAL_AUTOMATED_REMINDER_LIMIT);
  });

  it("trial manual reminders/75", () => {
    const meters = buildBillingUsageMeters({
      entitlementState: "trial",
      clientUsage: { activeClientCount: 0, clientLimit: TRIAL_CLIENT_LIMIT },
      invoiceUsage: { used: 0, limit: TRIAL_INVOICE_LIMIT_TOTAL },
      entitlementUsage: {
        workspace_id: "ws",
        trial_invoices_created: 0,
        ai_generations_successful: 0,
        automated_reminders_sent: 0,
        manual_email_reminders_sent: 40,
      },
    });
    const reminders = meters.find((meter) => meter.id === "manual_email_reminders");
    assert.equal(reminders?.used, 40);
    assert.equal(reminders?.limit, TRIAL_MANUAL_EMAIL_REMINDER_LIMIT);
  });

  it("paid Starter clients /25", () => {
    const meters = buildBillingUsageMeters({
      entitlementState: "paid",
      clientUsage: { activeClientCount: 5, clientLimit: 25 },
      invoiceUsage: { used: 0, limit: 50 },
    });
    const clients = meters.find((meter) => meter.id === "clients");
    assert.equal(clients?.used, 5);
    assert.equal(clients?.limit, 25);
  });

  it("paid Starter invoices /50 monthly", () => {
    const meters = buildBillingUsageMeters({
      entitlementState: "paid",
      clientUsage: { activeClientCount: 0, clientLimit: 25 },
      invoiceUsage: { used: 10, limit: 50 },
    });
    const invoices = meters.find((meter) => meter.id === "invoices");
    assert.equal(invoices?.used, 10);
    assert.equal(invoices?.limit, 50);
    assert.equal(invoices?.periodType, "monthly");
    assert.match(invoices?.periodLabel ?? "", /Resets monthly/);
  });

  it("Business unlimited clients", () => {
    const meters = buildBillingUsageMeters({
      entitlementState: "paid",
      clientUsage: { activeClientCount: 100, clientLimit: null },
      invoiceUsage: { used: 0, limit: null },
    });
    const clients = meters.find((meter) => meter.id === "clients");
    assert.equal(clients?.unlimited, true);
    assert.equal(clients?.remainingCopy, "Unlimited");
  });

  it("Business unlimited invoices", () => {
    const meters = buildBillingUsageMeters({
      entitlementState: "paid",
      clientUsage: { activeClientCount: 0, clientLimit: null },
      invoiceUsage: { used: 500, limit: null },
    });
    const invoices = meters.find((meter) => meter.id === "invoices");
    assert.equal(invoices?.unlimited, true);
    assert.equal(invoices?.remainingCopy, "Unlimited");
  });

  it("paid AI hard quota NOT displayed", () => {
    const meters = buildBillingUsageMeters({
      entitlementState: "paid",
      clientUsage: { activeClientCount: 0, clientLimit: 25 },
      invoiceUsage: { used: 0, limit: 50 },
    });
    assert.equal(meters.some((meter) => meter.id === "ai"), false);
  });

  it("paid reminder hard quota NOT displayed", () => {
    const meters = buildBillingUsageMeters({
      entitlementState: "paid",
      clientUsage: { activeClientCount: 0, clientLimit: 25 },
      invoiceUsage: { used: 0, limit: 50 },
    });
    assert.equal(meters.some((meter) => meter.id === "automated_reminders"), false);
    assert.equal(meters.some((meter) => meter.id === "manual_email_reminders"), false);
  });
});
