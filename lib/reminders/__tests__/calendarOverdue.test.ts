import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import { instantToWorkspaceCalendarDate, formatDateOnlyField } from "@/lib/datetime/formatDateTime";
import { computeInvoiceOverdueDays } from "@/lib/invoices/workspaceInvoiceAging";
import {
  buildReminderTemplateContext,
  renderReminderTemplateFromContext,
} from "../render";
import { renderReminderEmail } from "@/lib/email/templates";
import {
  computeReminderDaysOverdue,
  resolveReminderOverdueReferenceDate,
} from "../calendarOverdue";

describe("computeReminderDaysOverdue", () => {
  it("returns 14 for due 2026-07-09 and reference 2026-07-23", () => {
    assert.equal(
      computeReminderDaysOverdue({
        dueDate: "2026-07-09",
        referenceDate: "2026-07-23",
      }),
      14
    );
  });

  it("returns 40 for due Jul 1 and send Aug 10", () => {
    assert.equal(
      computeReminderDaysOverdue({
        dueDate: "2026-07-01",
        referenceDate: "2026-08-10",
      }),
      40
    );
  });

  it("returns 11 for due Jul 30 and send Aug 10", () => {
    assert.equal(
      computeReminderDaysOverdue({
        dueDate: "2026-07-30",
        referenceDate: "2026-08-10",
      }),
      11
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

  it("matches canonical computeInvoiceOverdueDays helper", () => {
    assert.equal(
      computeReminderDaysOverdue({
        dueDate: "2026-07-01",
        referenceDate: "2026-08-10",
      }),
      computeInvoiceOverdueDays({
        dueDate: "2026-07-01",
        workspaceToday: "2026-08-10",
      })
    );
  });
});

describe("resolveReminderOverdueReferenceDate", () => {
  it("uses workspace-local today at send time for rule-bound sends", () => {
    const instant = new Date("2026-08-10T10:00:00.000Z");
    assert.equal(
      resolveReminderOverdueReferenceDate({
        workspaceTimeZone: "UTC",
        evaluationInstant: instant,
      }),
      "2026-08-10"
    );
  });

  it("does not use scheduled occurrence date for overdue reference", () => {
    const instant = new Date("2026-08-10T10:00:00.000Z");
    const reference = resolveReminderOverdueReferenceDate({
      workspaceTimeZone: "UTC",
      evaluationInstant: instant,
    });
    assert.notEqual(reference, "2026-08-05");
    assert.equal(reference, "2026-08-10");
  });

  it("uses workspace-local today for generic manual sends", () => {
    const instant = new Date("2026-07-22T22:13:00.000Z");
    assert.equal(
      resolveReminderOverdueReferenceDate({
        workspaceTimeZone: "Asia/Baghdad",
        evaluationInstant: instant,
      }),
      "2026-07-23"
    );
  });
});

describe("reminder rendering overdue contract", () => {
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

  it("final notice template uses current overdue age, not rule offset", () => {
    const daysOverdue = computeReminderDaysOverdue({
      dueDate: "2026-07-01",
      referenceDate: "2026-08-10",
    });
    assert.equal(daysOverdue, 40);

    const context = buildReminderTemplateContext({
      invoiceView: {
        invoice_number: "INV-0001",
        due_date: "2026-07-01",
        outstanding: 4180,
        currency: "USD",
        workspace_name: "Acme",
      },
      client: { name: "Client", email: "client@test.com" },
      referenceDate: "2026-08-10",
      daysOverdue,
    });

    const rendered = renderReminderTemplateFromContext({
      template: {
        id: "final",
        subject: "Final notice for invoice {{invoice_number}}",
        body:
          "This is a final reminder that invoice {{invoice_number}} for {{amount_due}} is still unpaid, " +
          "{{days_overdue}} days after the due date ({{due_date}}).",
      },
      context,
    });

    assert.match(rendered.html, /40 days after the due date/);
    assert.doesNotMatch(rendered.html, /35 days after the due date/);
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

describe("send path overdue contract", () => {
  it("send.ts uses workspace today for overdue age, not scheduledDate", () => {
    const sendSrc = readFileSync("lib/reminders/send.ts", "utf8");
    assert.match(sendSrc, /resolveReminderOverdueReferenceDate\(\{/);
    assert.match(sendSrc, /workspaceTimeZone,/);
    assert.doesNotMatch(
      sendSrc,
      /resolveReminderOverdueReferenceDate\([\s\S]*scheduledDate/
    );
  });

  it("scheduledDate propagation remains for duplicate guard only", () => {
    const actionSrc = readFileSync("app/[workspaceId]/reminders/actions.ts", "utf8");
    const buttonSrc = readFileSync(
      "app/[workspaceId]/reminders/_components/send-reminder-button.tsx",
      "utf8"
    );

    assert.match(actionSrc, /scheduledDate/);
    assert.match(buttonSrc, /scheduledDate/);
  });
});

describe("reminder email overdue accuracy scenarios", () => {
  function emailDaysOverdue(params: {
    dueDate: string;
    sendInstant: Date;
    workspaceTimeZone?: string;
  }) {
    const referenceDate = resolveReminderOverdueReferenceDate({
      workspaceTimeZone: params.workspaceTimeZone ?? "UTC",
      evaluationInstant: params.sendInstant,
    });
    return computeReminderDaysOverdue({
      dueDate: params.dueDate,
      referenceDate,
    });
  }

  it("recurring occurrence scheduled earlier but sent later uses current age", () => {
    assert.equal(
      emailDaysOverdue({
        dueDate: "2026-07-01",
        sendInstant: new Date("2026-08-10T12:00:00.000Z"),
      }),
      40
    );
  });

  it("catch-up reminder uses current age", () => {
    assert.equal(
      emailDaysOverdue({
        dueDate: "2026-07-01",
        sendInstant: new Date("2026-08-10T08:00:00.000Z"),
      }),
      40
    );
  });

  it("manual and automated paths share send.ts overdue resolver", () => {
    const sendSrc = readFileSync("lib/reminders/send.ts", "utf8");
    assert.match(sendSrc, /computeReminderDaysOverdue\(/);
    assert.equal(
      sendSrc.match(/resolveReminderOverdueReferenceDate\(/g)?.length,
      1
    );
  });

  it("workspace timezone boundary uses local calendar date", () => {
    const instant = new Date("2026-08-09T22:30:00.000Z");
    assert.equal(
      emailDaysOverdue({
        dueDate: "2026-07-01",
        sendInstant: instant,
        workspaceTimeZone: "Asia/Baghdad",
      }),
      40
    );
  });

  it("due today => 0 days overdue", () => {
    assert.equal(
      emailDaysOverdue({
        dueDate: "2026-08-10",
        sendInstant: new Date("2026-08-10T15:00:00.000Z"),
      }),
      0
    );
  });

  it("before due => 0 days overdue (not negative)", () => {
    assert.equal(
      emailDaysOverdue({
        dueDate: "2026-08-15",
        sendInstant: new Date("2026-08-10T15:00:00.000Z"),
      }),
      0
    );
  });
});
