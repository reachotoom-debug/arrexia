import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { instantToWorkspaceCalendarDate, formatDateOnlyField } from "@/lib/datetime/formatDateTime";
import {
  buildReminderTemplateContext,
  renderReminderTemplateFromContext,
} from "../render";
import { renderReminderEmail } from "@/lib/email/templates";
import {
  computeReminderDaysOverdue,
  resolveReminderOverdueReferenceDate,
} from "../calendarOverdue";

describe("computeReminderDaysOverdue (R2B.4)", () => {
  it("returns 14 for due 2026-07-09 and reference 2026-07-23", () => {
    assert.equal(
      computeReminderDaysOverdue({
        dueDate: "2026-07-09",
        referenceDate: "2026-07-23",
      }),
      14
    );
  });

  it("uses workspace-local today at UTC+3 boundary (not server UTC today)", () => {
    const instant = new Date("2026-07-22T22:13:00.000Z");
    const referenceDate = instantToWorkspaceCalendarDate(instant, "Asia/Baghdad");
    assert.equal(referenceDate, "2026-07-23");
    assert.equal(
      computeReminderDaysOverdue({
        dueDate: "2026-07-09",
        referenceDate,
      }),
      14
    );
  });

  it("returns 0 for on_due when reference equals due date", () => {
    assert.equal(
      computeReminderDaysOverdue({
        dueDate: "2026-07-23",
        referenceDate: "2026-07-23",
      }),
      0
    );
  });

  it("returns 0 for before_due when reference is before due date", () => {
    assert.equal(
      computeReminderDaysOverdue({
        dueDate: "2026-07-26",
        referenceDate: "2026-07-23",
      }),
      0
    );
  });
});

describe("resolveReminderOverdueReferenceDate (R2B.4)", () => {
  it("prefers explicit scheduledDate for rule-bound sends", () => {
    assert.equal(
      resolveReminderOverdueReferenceDate({
        ruleId: "rule-after-14",
        scheduledDate: "2026-07-23",
        dueDate: "2026-07-09",
        triggerType: "after_due",
        offsetDays: 14,
      }),
      "2026-07-23"
    );
  });

  it("recomputes rule occurrence when scheduledDate is missing", () => {
    assert.equal(
      resolveReminderOverdueReferenceDate({
        ruleId: "rule-after-14",
        dueDate: "2026-07-09",
        triggerType: "after_due",
        offsetDays: 14,
      }),
      "2026-07-23"
    );
  });

  it("uses workspace-local today for generic manual sends", () => {
    const instant = new Date("2026-07-22T22:13:00.000Z");
    assert.equal(
      resolveReminderOverdueReferenceDate({
        ruleId: null,
        workspaceTimeZone: "Asia/Baghdad",
        evaluationInstant: instant,
      }),
      "2026-07-23"
    );
  });
});

describe("reminder rendering overdue contract (R2B.4)", () => {
  const baseContextArgs = {
    invoiceView: {
      invoice_number: "INV-0073",
      due_date: "2026-07-09",
      outstanding: 5000,
      currency: "USD",
      workspace_name: "Acme",
    },
    client: { name: "Client", email: "client@test.com" },
    daysOverdue: 14,
  };

  it("renders {{days_overdue}} token as 14", () => {
    const context = buildReminderTemplateContext(baseContextArgs);
    assert.equal(context.daysOverdue, 14);
    assert.equal(context.replacements.days_overdue, "14");

    const rendered = renderReminderTemplateFromContext({
      template: {
        id: "tpl",
        subject: "Reminder",
        body: "Overdue {{days_overdue}} days for {{invoice_number}}",
      },
      context,
    });
    assert.match(rendered.html, /Overdue 14 days/);
  });

  it("keeps email shell and template token identical", () => {
    const context = buildReminderTemplateContext(baseContextArgs);
    const email = renderReminderEmail({
      businessName: "Acme",
      clientName: "Client",
      invoiceNumber: "INV-0073",
      dueDate: "2026-07-09",
      daysOverdue: context.daysOverdue,
      mainMessage: renderReminderTemplateFromContext({
        template: {
          id: "tpl",
          subject: "Reminder",
          body: "Token={{days_overdue}}",
        },
        context,
      }).html,
    });

    assert.match(email.text, /Days overdue[\s\S]*14/);
    assert.match(email.html, /Token=14/);
  });

  it("rule-bound after_due / 14 shell summary shows 14", () => {
    const daysOverdue = computeReminderDaysOverdue({
      dueDate: "2026-07-09",
      referenceDate: "2026-07-23",
    });
    const email = renderReminderEmail({
      businessName: "Acme",
      clientName: "Client",
      invoiceNumber: "INV-0073",
      dueDate: "2026-07-09",
      daysOverdue,
    });
    assert.match(email.text, /Days overdue[\s\S]*14/);
  });

  it("formats date-only due dates without UTC day shift", () => {
    const formatted = formatDateOnlyField("2026-07-09");
    assert.match(formatted, /Jul/);
    assert.match(formatted, /9/);
    assert.match(formatted, /2026/);

    const context = buildReminderTemplateContext(baseContextArgs);
    assert.match(context.dueDateFormatted, /Jul/);
    assert.match(context.dueDateFormatted, /9/);
  });
});

describe("scheduledDate propagation contract (R2B.4)", () => {
  it("wires scheduledDate through suggested send action chain", () => {
    const actionSrc = readFileSync("app/[workspaceId]/reminders/actions.ts", "utf8");
    const buttonSrc = readFileSync(
      "app/[workspaceId]/reminders/_components/send-reminder-button.tsx",
      "utf8"
    );

    assert.match(actionSrc, /scheduledDate/);
    assert.match(actionSrc, /scheduledDate,/);
    assert.match(buttonSrc, /scheduledDate/);
    assert.match(buttonSrc, /scheduledDate: scheduledDate/);
  });
});
