"use client";

import Link from "next/link";
import { WhatsAppCollectionLink } from "@/components/collections/WhatsAppCollectionLink";
import { SendReminderButton } from "../../reminders/_components/send-reminder-button";
import type { CollectionActionExecution } from "@/lib/actions/resolveCollectionActionExecution";

type CollectionActionCellProps = {
  workspaceId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  clientName: string | null;
  clientPhone: string | null;
  outstanding: number;
  currency: string | null;
  dueDate: string | null;
  daysOverdue: number;
  execution: CollectionActionExecution;
};

export function CollectionActionCell({
  workspaceId,
  invoiceId,
  invoiceNumber,
  clientName,
  clientPhone,
  outstanding,
  currency,
  dueDate,
  daysOverdue,
  execution,
}: CollectionActionCellProps) {
  const viewLink = (
    <Link
      href={`/${workspaceId}/invoices/${invoiceId}`}
      className="text-sm font-medium text-slate-600 hover:text-slate-900 hover:underline"
    >
      View
    </Link>
  );

  const whatsAppLink = (
    <WhatsAppCollectionLink
      phone={clientPhone}
      clientName={clientName}
      invoiceNumber={invoiceNumber}
      outstanding={outstanding}
      currency={currency}
      dueDate={dueDate}
      daysOverdue={daysOverdue}
      variant="link"
    />
  );

  if (execution.mode === "view_only") {
    return (
      <div className="flex flex-wrap items-center gap-3">
        {whatsAppLink}
        <Link
          href={`/${workspaceId}/invoices/${invoiceId}`}
          className="text-sm font-medium text-blue-600 hover:underline"
        >
          View invoice
        </Link>
      </div>
    );
  }

  const sendProps =
    execution.mode === "rule_bound"
      ? {
          ruleId: execution.ruleId,
          templateId: execution.templateId,
          scheduledDate: execution.scheduledDate,
        }
      : {
          ruleId: null,
          templateId: null,
          scheduledDate: null,
        };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="inline-flex items-center gap-1.5">
        <SendReminderButton
          workspaceId={workspaceId}
          invoiceId={invoiceId}
          invoiceNumber={invoiceNumber}
          clientName={clientName}
          clientEmail={execution.clientEmail}
          {...sendProps}
        />
        <span className="text-sm font-medium text-slate-800">Send reminder</span>
      </div>
      {whatsAppLink}
      {viewLink}
    </div>
  );
}
