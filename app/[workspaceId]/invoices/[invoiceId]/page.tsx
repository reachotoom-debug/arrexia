import Link from "next/link";
import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/auth/server";
import { createRoutePerf, perfTime } from "@/lib/perf/server";
import { isSandboxSenderActive, getResendTestRecipientEmail } from "@/lib/email/sendEmail";
import { formatCurrency } from "@/lib/format/currency";
import { PAYMENT_TERMS_OPTIONS } from "@/lib/invoices/paymentTerms";
import { SendInvoiceButton } from "./_components/SendInvoiceButton";
import { DownloadInvoicePdfButton } from "./_components/DownloadInvoicePdfButton";
import { ArchivedBanner } from "@/components/ui/archived-banner";
import { InvoiceArchiveButton } from "./_components/InvoiceArchiveButton";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { buildInvoiceBranding } from "../_utils/branding";
import { getInvoiceSenderDisplay } from "../_utils/invoiceSenderDisplay";
import { coerceMoney } from "../_utils/invoiceMoney";
import { resolvePaymentInstructionLines, getInvoiceDueStatus, shouldShowDueTiming } from "@/lib/invoices/invoiceDisplay";
import { prettyLabel } from "@/lib/formatters/prettyLabel";
import { unstable_noStore as noStore } from "next/cache";

interface InvoicePageProps {
  params: Promise<{ workspaceId: string; invoiceId: string }>;
}

// Helper to detect if a string is a UUID
const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export default async function InvoicePage({ params }: InvoicePageProps) {
  noStore();
  const perf = createRoutePerf("invoice-detail");
  const { workspaceId, invoiceId } = await params;
  await perf.time("requireWorkspace", () => requireWorkspace(workspaceId));
  const sandboxMode = isSandboxSenderActive();
  const sandboxTestRecipientEmail = getResendTestRecipientEmail();
  const supabase = await supabaseServer();

  // 1) Load invoice (by id or invoice_number), including archived
  const invoiceSelect = `
    id,
    workspace_id,
    client_id,
    invoice_number,
    status,
    issue_date,
    due_date,
    currency,
    amount,
    subtotal,
    discount_percent,
    discount_amount,
    tax_percent,
    tax_amount,
    payment_terms,
    payment_terms_days,
    po_number,
    notes,
    created_at,
    updated_at,
    archived_at
  `;

  let invoiceQuery = supabase
    .from("invoices")
    .select(invoiceSelect)
    .eq("workspace_id", workspaceId);

  if (isUuid(invoiceId)) {
    invoiceQuery = invoiceQuery.eq("id", invoiceId);
  } else {
    invoiceQuery = invoiceQuery.eq("invoice_number", invoiceId);
  }

  const { data: invoice, error: invoiceError } = await perfTime(
    "invoice-detail",
    "baseInvoice",
    async () => invoiceQuery.maybeSingle(),
    (result) => `found=${result.data ? 1 : 0}`
  );

  if (invoiceError) {
    if (process.env.NODE_ENV === "development") {
      console.error("[InvoicePage] failed to load invoice:", invoiceError.message);
    }
    throw new Error(`Failed to load invoice: ${invoiceError.message}`);
  }

  if (!invoice) {
    notFound();
  }

  const isArchived = invoice.archived_at !== null;
  /** Temporarily hidden — clone query/route handling left intact. */
  const showCloneInvoiceAction = false;

  // 2) Load client and settings in parallel
  const [clientRes, settingsRes] = await Promise.all([
    perfTime("invoice-detail", "client", async () =>
      invoice.client_id
        ? supabase
            .from("clients")
            .select(
              "id, workspace_id, name, email, company, country, country_code, whatsapp_phone, whatsapp, payment_terms, is_active, archived_at"
            )
            .eq("workspace_id", workspaceId)
            .eq("id", invoice.client_id)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null })
    ),
    perfTime("invoice-detail", "settings", async () =>
      supabase
        .from("settings")
        .select("*")
        .eq("workspace_id", workspaceId)
        .maybeSingle()
    ),
  ]);

  const client = clientRes.data;
  const settings = settingsRes.data;

  // Build branding from settings (single source of truth for invoice display)
  const branding = buildInvoiceBranding(settings);
  const sender = getInvoiceSenderDisplay(settings);

  // 3) Load items, payments, delivery logs, invoices_view in parallel
  const [itemsRes, paymentsRes, deliveryLogsRes, invoiceViewRes] =
    await Promise.all([
      perfTime("invoice-detail", "items", async () =>
        supabase
          .from("invoice_items")
          .select("id, name, description, quantity, unit_price, position")
          .eq("invoice_id", invoice.id)
          .order("position", { ascending: true })
      ),
      perfTime("invoice-detail", "payments", async () =>
        supabase
          .from("payments")
          .select(
            "id, payment_date, amount, currency, method, status, transaction_id, notes, payment_provider, created_at, archived_at"
          )
          .eq("invoice_id", invoice.id)
          .is("archived_at", null)
          .order("payment_date", { ascending: false })
      ),
      perfTime("invoice-detail", "deliveryLogs", async () =>
        supabase
          .from("invoice_delivery_logs")
          .select(
            "id, workspace_id, invoice_id, recipient_email, status, error_message, delivery_method, created_at"
          )
          .eq("invoice_id", invoice.id)
          .eq("workspace_id", workspaceId)
          .order("created_at", { ascending: false })
      ),
      perfTime("invoice-detail", "invoicesView", async () =>
        supabase
          .from("invoices_view")
          .select("paid, outstanding, client_name, display_status, is_overdue, overdue_days")
          .eq("id", invoice.id)
          .maybeSingle()
      ),
    ]);

  const items = itemsRes.data ?? [];
  const payments = paymentsRes.data ?? [];
  const deliveryLogs = deliveryLogsRes.data ?? [];
  const invoiceView = invoiceViewRes.data;

  const lineItems = items;
  const paymentList = payments;
  const deliveryHistory = deliveryLogs;

  // ---------- BILL TO (final logic) ----------
  const billToName =
    invoiceView?.client_name ??
    client?.name ??
    "Client";

  const billToEmail = client?.email ?? null;
  const billToCompany = client?.company ?? null;
  const billToCountry = client?.country ?? null;
  // Fallback: prefer whatsapp_phone (normalized), else whatsapp (raw), else null
  const rawPhone = client?.whatsapp_phone || client?.whatsapp || null;
  const billToPhone = rawPhone?.trim() || null;

  // Use invoice.currency with settings fallback for all monetary displays
  const currency = invoice.currency || settings?.default_currency || "USD";

  // Monetary values (use DB as source of truth)
  const subtotal = coerceMoney(invoice.subtotal);
  const discount = coerceMoney(invoice.discount_amount);
  const tax = coerceMoney(invoice.tax_amount);
  const total = coerceMoney(invoice.amount);

  const paid = coerceMoney(invoiceView?.paid);
  const outstanding = coerceMoney(invoiceView?.outstanding);

  const paidFromPayments = paymentList
    .filter(
      (p) =>
        p.status === "completed" ||
        p.status === "paid" ||
        !p.status
    )
    .reduce((sum, p) => sum + coerceMoney(p.amount), 0);

  const displayPaid = invoiceView != null ? paid : paidFromPayments;
  const displayOutstanding =
    invoiceView != null ? outstanding : Math.max(total - paidFromPayments, 0);

  const discountPercent = coerceMoney(invoice.discount_percent);
  const taxPercent = coerceMoney(invoice.tax_percent);

  const moneyOpts = {
    currency: invoice.currency,
    fallbackCurrency: settings?.default_currency,
  } as const;

  // Use invoices_view display status as source of truth for status/overdue logic.
  const paymentStatus = invoiceView?.display_status || invoice.status || "sent";

  const hasStructuredPaymentDetails = [
    branding.paymentDetails.bankName,
    branding.paymentDetails.bankAccountName,
    branding.paymentDetails.bankAccountNumber,
    branding.paymentDetails.bankSwift,
    branding.paymentDetails.bankIban,
    branding.paymentDetails.paypalHandle,
    branding.paymentDetails.stripeDescriptor,
  ].some((v) => !!v?.trim());

  const paymentInstructionLines = resolvePaymentInstructionLines(
    branding.paymentDetails.otherInstructions,
    hasStructuredPaymentDetails
  );

  const dueTiming =
    invoice.due_date && shouldShowDueTiming(paymentStatus)
      ? getInvoiceDueStatus(invoice.due_date)
      : null;

  const formatDate = (value: string | null | undefined) => {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleDateString("en-US", {
        month: "short",
        day: "2-digit",
        year: "numeric",
      });
    } catch {
      return "—";
    }
  };

  const formatDateTime = (value: string | null | undefined) => {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  };

  // Timeline events
  const timelineEvents = [
    {
      event: "Invoice created",
      date: invoice.created_at,
      description: `Invoice ${invoice.invoice_number} was created`,
    },
    ...(invoice.updated_at && invoice.updated_at !== invoice.created_at
      ? [
          {
            event: "Invoice updated",
            date: invoice.updated_at,
            description: "Invoice details were modified",
          },
        ]
      : []),
    ...(invoice.status === "sent"
      ? [
          {
            event: "Invoice sent",
            date: invoice.updated_at || invoice.created_at,
            description: "Invoice was marked as sent",
          },
        ]
      : []),
    ...paymentList.map((payment) => ({
      event: "Payment recorded",
      date: payment.payment_date || payment.created_at,
      description: `Payment of ${formatCurrency(
        coerceMoney(payment.amount),
        moneyOpts
      )} recorded`,
    })),
  ]
    .filter((event) => event.date)
    .sort((a, b) => {
      const dateA = eventDateToMillis(a.date);
      const dateB = eventDateToMillis(b.date);
      return dateB - dateA;
    });

  function eventDateToMillis(value: string | null | undefined): number {
    if (!value) return 0;
    try {
      return new Date(value).getTime();
    } catch {
      return 0;
    }
  }

  perf.finish({
    items: lineItems.length,
    payments: paymentList.length,
  });

  return (
    <div className="mx-auto w-full max-w-5xl min-w-0 space-y-6">
      {/* Archived Banner */}
      {isArchived && <ArchivedBanner entityType="invoice" />}

      {/* Header with Logo */}
      {branding.logoUrl && (
        <div className="flex justify-start">
          <img
            src={branding.logoUrl}
            alt={sender.name}
            className="h-12 w-auto object-contain"
          />
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Invoice
          </p>
          <h1 className="text-2xl font-semibold text-slate-900">
            {invoice.invoice_number}
          </h1>
          <div className="mt-2">
            <StatusBadge type="invoice" status={paymentStatus || invoice.status || "sent"} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {!isArchived && (
            <>
              <Link
                href={`/${workspaceId}/invoices/${invoice.id}/edit`}
                className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                Edit Invoice
              </Link>
              {showCloneInvoiceAction ? (
                <Link
                  href={`/${workspaceId}/invoices/new?clone=${invoice.id}`}
                  className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  Clone Invoice
                </Link>
              ) : null}
              <SendInvoiceButton
                workspaceId={workspaceId}
                invoiceId={invoice.id}
                clientEmail={billToEmail ?? undefined}
                invoiceNumber={invoice.invoice_number}
                sandboxMode={sandboxMode}
                sandboxTestRecipientEmail={sandboxTestRecipientEmail}
              />
              <InvoiceArchiveButton
                workspaceId={workspaceId}
                invoiceId={invoice.id}
                isArchived={false}
              />
            </>
          )}
          {isArchived && (
            <InvoiceArchiveButton
              workspaceId={workspaceId}
              invoiceId={invoice.id}
              isArchived={true}
            />
          )}
          <DownloadInvoicePdfButton
            pdfHref={`/${workspaceId}/invoices/${invoice.id}/pdf`}
            fileName={`invoice-${invoice.invoice_number}.pdf`}
            className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
      </div>

      {/* From / Bill To */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* From */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">From</h2>
          <p className="text-sm font-medium text-slate-900 mb-2">{sender.name}</p>
          <div className="space-y-0.5">
            {sender.email && (
              <p className="text-sm text-slate-500">{sender.email}</p>
            )}
            {sender.phone && (
              <p className="text-sm text-slate-500">{sender.phone}</p>
            )}
            {sender.website && (
              <p className="text-sm text-slate-500">{sender.website}</p>
            )}
            {sender.taxId && (
              <p className="text-sm text-slate-500">Tax ID: {sender.taxId}</p>
            )}
          </div>
          {(sender.addressLines.length > 0 || sender.location) && (
            <div className="mt-3 border-t border-slate-100 pt-3 space-y-0.5">
              {sender.addressLines.map((line, i) => (
                <p key={`addr-${i}`} className="text-sm text-slate-500">
                  {line}
                </p>
              ))}
              {sender.location && (
                <p className="text-sm text-slate-500">{sender.location}</p>
              )}
            </div>
          )}
        </div>

        {/* Bill To – read-only */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Bill To</h2>
          <div className="space-y-0.5">
            <p className="text-sm font-medium text-slate-900">{billToName}</p>
            {billToCompany && (
              <p className="text-sm text-slate-700">{billToCompany}</p>
            )}
          </div>
          <div className="mt-1 space-y-0.5">
            {billToEmail && (
              <p className="text-sm text-slate-500">{billToEmail}</p>
            )}
            {billToPhone && (
              <p className="text-sm text-slate-500">{billToPhone}</p>
            )}
            {billToCountry && (
              <p className="text-sm text-slate-500">{billToCountry}</p>
            )}
          </div>
        </div>
      </div>

      {/* Invoice Details & Summary */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Invoice Details */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">
            Invoice Details
          </h2>
          <dl className="space-y-1 text-sm text-slate-700">
            <div className="flex justify-between">
              <dt className="text-slate-500">Issue Date</dt>
              <dd>{formatDate(invoice.issue_date)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Due Date</dt>
              <dd>{formatDate(invoice.due_date)}</dd>
            </div>
            <div className="flex justify-between items-center">
              <dt className="text-slate-500">Status</dt>
              <dd>
                <StatusBadge type="invoice" status={paymentStatus || invoice.status || "sent"} />
              </dd>
            </div>
            {dueTiming && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Due</dt>
                <dd
                  className={
                    dueTiming.bold ? "font-medium text-red-600" : "text-slate-700"
                  }
                >
                  {dueTiming.line}
                </dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-slate-500">Payment Terms</dt>
              <dd>
                {(() => {
                  const termsOption = PAYMENT_TERMS_OPTIONS.find(
                    (opt) => opt.code === invoice.payment_terms
                  );
                  let label = termsOption?.label ?? "Custom";

                  if (
                    invoice.payment_terms === "custom" &&
                    invoice.payment_terms_days != null
                  ) {
                    label = `Custom (${invoice.payment_terms_days} days)`;
                  }

                  return label;
                })()}
              </dd>
            </div>
            {invoice.po_number && (
              <div className="flex justify-between">
                <dt className="text-slate-500">PO Number</dt>
                <dd>{invoice.po_number}</dd>
              </div>
            )}
            <div className="flex justify-between">
              <dt className="text-slate-500">Currency</dt>
              <dd>{currency}</dd>
            </div>
          </dl>
        </div>

        {/* Summary */}
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">
            Summary
          </h2>
          <dl className="space-y-1 text-sm text-slate-700">
            <div className="flex justify-between">
              <dt className="text-slate-500">Subtotal</dt>
              <dd>{formatCurrency(subtotal, moneyOpts)}</dd>
            </div>
            {discountPercent > 0 && (
              <div className="flex justify-between">
                <dt className="text-slate-500">
                  Discount ({discountPercent}%)
                </dt>
                <dd>-{formatCurrency(discount, moneyOpts)}</dd>
              </div>
            )}
            {taxPercent > 0 && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Tax ({taxPercent}%)</dt>
                <dd>{formatCurrency(tax, moneyOpts)}</dd>
              </div>
            )}
            <div className="mt-2 border-t border-slate-200 pt-2 flex justify-between">
              <dt className="text-slate-700 font-medium">Total</dt>
              <dd className="text-slate-900 font-semibold">
                {formatCurrency(total, moneyOpts)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Amount Paid</dt>
              <dd className="text-emerald-600">
                {formatCurrency(displayPaid, moneyOpts)}
              </dd>
            </div>
            <div className="mt-2 border-t border-slate-200 pt-2 flex justify-between">
              <dt className="text-slate-700 font-medium">Outstanding</dt>
              <dd
                className={`font-semibold ${
                  displayOutstanding > 0
                    ? "text-red-600"
                    : displayOutstanding < 0
                    ? "text-emerald-600"
                    : "text-slate-900"
                }`}
              >
                {formatCurrency(Math.abs(displayOutstanding), moneyOpts)}
              </dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Line items */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">
          Line Items
        </h2>
        <div className="overflow-x-auto">
          <table className="min-w-full table-auto text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="px-3 py-2 text-left">Item</th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Unit Price</th>
                <th className="px-3 py-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {lineItems.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-3 py-4 text-center text-sm text-slate-500"
                  >
                    No items on this invoice.
                  </td>
                </tr>
              )}

              {lineItems.map((item) => {
                const qty = coerceMoney(item.quantity);
                const unitPrice = coerceMoney(item.unit_price);
                const amount = qty * unitPrice;
                return (
                  <tr
                    key={item.id}
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-3 py-2 font-medium text-slate-900">
                      {item.name}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {item.description || "—"}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {qty}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {formatCurrency(unitPrice, moneyOpts)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {formatCurrency(amount, moneyOpts)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Payment History */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">
          Payment History
        </h2>
        {paymentList.length === 0 ? (
          <div className="text-center py-6 text-sm text-slate-500">
            <p>No payments recorded for this invoice yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-right">Amount</th>
                  <th className="px-3 py-2 text-left">Method</th>
                  <th className="px-3 py-2 text-left">Transaction ID</th>
                  <th className="px-3 py-2 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {paymentList.map((payment) => (
                  <tr
                    key={payment.id}
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-3 py-2 text-slate-700">
                      {formatDate(
                        payment.payment_date || payment.created_at
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-medium text-slate-900">
                      {formatCurrency(coerceMoney(payment.amount), moneyOpts)}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {prettyLabel(payment.method)}
                    </td>
                    <td className="px-3 py-2 text-slate-500 font-mono text-xs">
                      {payment.transaction_id || "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-500">
                      {payment.notes || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Notes */}
      {invoice.notes && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-1">
            Notes
          </h2>
          <p className="text-sm text-slate-700 whitespace-pre-line">
            {invoice.notes}
          </p>
        </div>
      )}

      {/* Delivery History */}
      {deliveryHistory.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-3">
            Delivery History
          </h2>
          <div className="overflow-x-auto">
            <table className="min-w-full table-auto text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="px-3 py-2 text-left">Sent At</th>
                  <th className="px-3 py-2 text-left">Recipient</th>
                  <th className="px-3 py-2 text-left">Status</th>
                  <th className="px-3 py-2 text-left">Error</th>
                </tr>
              </thead>
              <tbody>
                {deliveryHistory.map((log) => (
                  <tr
                    key={log.id}
                    className="border-b border-slate-100 hover:bg-slate-50"
                  >
                    <td className="px-3 py-2 text-slate-700">
                      {formatDateTime(log.created_at)}
                    </td>
                    <td className="px-3 py-2 text-slate-700">
                      {log.recipient_email}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          log.status === "sent"
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-red-100 text-red-700"
                        }`}
                      >
                        {log.status === "sent" ? "Sent" : "Failed"}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-slate-500 text-xs">
                      {log.error_message || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Timeline */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-3">
          Invoice Timeline
        </h2>
        <div className="space-y-3">
          {timelineEvents.map((event, index) => (
            <div key={index} className="flex gap-3 text-sm">
              <div className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500 mt-1.5" />
              <div className="flex-1">
                <div className="font-medium text-slate-900">
                  {event.event}
                </div>
                <div className="text-xs text-slate-500">
                  {formatDateTime(event.date)}
                </div>
                <div className="text-xs text-slate-400 mt-0.5">
                  {event.description}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Thank you / Payment details */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-1">
            Thank you
          </h2>
          <p className="text-sm text-slate-700 whitespace-pre-line">
            {branding.thankYou}
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-1">
            Payment details
          </h2>
          <div className="text-sm text-slate-700 space-y-1">
            {branding.hasAnyPaymentDetails ? (
              <>
                {branding.paymentDetails.bankName && (
                  <p>Bank: {branding.paymentDetails.bankName}</p>
                )}
                {branding.paymentDetails.bankAccountName && (
                  <p>Account name: {branding.paymentDetails.bankAccountName}</p>
                )}
                {branding.paymentDetails.bankAccountNumber && (
                  <p>Account number: {branding.paymentDetails.bankAccountNumber}</p>
                )}
                {branding.paymentDetails.bankSwift && (
                  <p>SWIFT: {branding.paymentDetails.bankSwift}</p>
                )}
                {branding.paymentDetails.bankIban && (
                  <p>IBAN: {branding.paymentDetails.bankIban}</p>
                )}
                {branding.paymentDetails.paypalHandle && (
                  <p>PayPal: {branding.paymentDetails.paypalHandle}</p>
                )}
                {branding.paymentDetails.stripeDescriptor && (
                  <p>Statement descriptor: {branding.paymentDetails.stripeDescriptor}</p>
                )}
                {paymentInstructionLines.map((line, i) => (
                  <p key={`pay-inst-${i}`} className="whitespace-pre-line">
                    {line}
                  </p>
                ))}
              </>
            ) : (
              <p className="text-slate-500">
                You can add your bank details, payment link, or instructions in Settings → Payments &amp; Defaults.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
