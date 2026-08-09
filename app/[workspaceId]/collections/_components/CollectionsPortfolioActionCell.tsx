"use client";

import Link from "next/link";
import { WhatsAppCollectionLink } from "@/components/collections/WhatsAppCollectionLink";
import { AiCollectionAssistDialog } from "@/components/collections/AiCollectionAssistDialog";
import { SendReminderButton } from "../../reminders/_components/send-reminder-button";

type CollectionsPortfolioActionCellProps = {
  workspaceId: string;
  invoiceId: string;
  invoiceNumber: string | null;
  clientName: string | null;
  clientEmail: string | null;
  clientPhone: string | null;
  clientCountry: string | null;
  businessName: string;
  outstanding: number;
  currency: string | null;
  dueDate: string | null;
  daysOverdue: number;
  evaluationDate: string;
};

export function CollectionsPortfolioActionCell({
  workspaceId,
  invoiceId,
  invoiceNumber,
  clientName,
  clientEmail,
  clientPhone,
  clientCountry,
  businessName,
  outstanding,
  currency,
  dueDate,
  daysOverdue,
  evaluationDate,
}: CollectionsPortfolioActionCellProps) {
  return (
    <div className="flex min-w-[10.5rem] flex-col items-end gap-1">
      <Link
        href={`/${workspaceId}/invoices/${invoiceId}`}
        className="inline-flex items-center whitespace-nowrap rounded-md bg-blue-600 px-2.5 py-1 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
      >
        View account
      </Link>
      <div className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-0.5 text-[11px] text-slate-500">
        {clientEmail ? (
          <>
            <span className="inline-flex items-center gap-1">
              <SendReminderButton
                workspaceId={workspaceId}
                invoiceId={invoiceId}
                invoiceNumber={invoiceNumber}
                clientName={clientName}
                clientEmail={clientEmail}
                ruleId={null}
                templateId={null}
                scheduledDate={null}
              />
              <span className="font-medium text-slate-600">Email</span>
            </span>
            <span className="hidden sm:inline text-slate-300" aria-hidden="true">
              ·
            </span>
          </>
        ) : null}
        <WhatsAppCollectionLink
          phone={clientPhone}
          clientCountry={clientCountry}
          clientName={clientName}
          businessName={businessName}
          invoiceNumber={invoiceNumber}
          outstanding={outstanding}
          currency={currency}
          dueDate={dueDate}
          daysOverdue={daysOverdue}
          evaluationDate={evaluationDate}
          variant="link"
        />
        <span className="hidden sm:inline text-slate-300" aria-hidden="true">
          ·
        </span>
        <AiCollectionAssistDialog
          workspaceId={workspaceId}
          invoiceId={invoiceId}
          clientPhone={clientPhone}
          clientCountry={clientCountry}
          variant="link"
        />
      </div>
    </div>
  );
}
