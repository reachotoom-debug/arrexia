import Image from "next/image";
import { formatCurrency } from "@/lib/format/currency";
import { formatDateOnlyField } from "@/lib/datetime/formatDateTime";
import {
  getInvoiceStatusBadgeClasses,
  getInvoiceStatusLabel,
} from "@/lib/invoices/status-ui";
import type { PublicInvoiceDto } from "@/lib/invoices/publicInvoiceDto";
import { companyInitials } from "@/lib/invoices/invoiceDisplay";

type PublicInvoiceViewProps = {
  invoice: PublicInvoiceDto;
};

function CompanyLogo({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  if (logoUrl) {
    return (
      <Image
        src={logoUrl}
        alt={`${name} logo`}
        width={56}
        height={56}
        className="h-14 w-14 rounded-lg border border-slate-200 object-contain"
        unoptimized
      />
    );
  }

  return (
    <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-slate-100 text-sm font-semibold text-slate-600">
      {companyInitials(name)}
    </div>
  );
}

function PaymentDetailsBlock({
  details,
  instructionLines,
}: {
  details: PublicInvoiceDto["paymentDetails"];
  instructionLines: string[];
}) {
  if (!details && instructionLines.length === 0) return null;

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-slate-800">Payment instructions</h2>
      {details && (
        <dl className="mt-3 space-y-1.5 text-sm text-slate-700">
          {details.bankName ? (
            <div>
              <dt className="inline font-medium">Bank: </dt>
              <dd className="inline">{details.bankName}</dd>
            </div>
          ) : null}
          {details.bankAccountName ? (
            <div>
              <dt className="inline font-medium">Account name: </dt>
              <dd className="inline">{details.bankAccountName}</dd>
            </div>
          ) : null}
          {details.bankAccountNumber ? (
            <div>
              <dt className="inline font-medium">Account number: </dt>
              <dd className="inline font-mono text-xs">{details.bankAccountNumber}</dd>
            </div>
          ) : null}
          {details.bankSwift ? (
            <div>
              <dt className="inline font-medium">SWIFT: </dt>
              <dd className="inline font-mono text-xs">{details.bankSwift}</dd>
            </div>
          ) : null}
          {details.bankIban ? (
            <div>
              <dt className="inline font-medium">IBAN: </dt>
              <dd className="inline font-mono text-xs">{details.bankIban}</dd>
            </div>
          ) : null}
          {details.paypalHandle ? (
            <div>
              <dt className="inline font-medium">PayPal: </dt>
              <dd className="inline">{details.paypalHandle}</dd>
            </div>
          ) : null}
          {details.stripeDescriptor ? (
            <div>
              <dt className="inline font-medium">Card / Stripe: </dt>
              <dd className="inline">{details.stripeDescriptor}</dd>
            </div>
          ) : null}
        </dl>
      )}
      {instructionLines.length > 0 && (
        <div className="mt-3 space-y-1 text-sm text-slate-700">
          {instructionLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}
    </section>
  );
}

export function PublicInvoiceView({ invoice }: PublicInvoiceViewProps) {
  const { financials } = invoice;
  const currencyOpts = { currency: financials.currency };
  const statusLabel = getInvoiceStatusLabel(invoice.displayStatus);
  const statusClasses = getInvoiceStatusBadgeClasses(invoice.displayStatus);
  const locationLine = [invoice.company.city, invoice.company.country]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex items-start gap-4">
            <CompanyLogo name={invoice.company.name} logoUrl={invoice.company.logoUrl} />
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">From</p>
              <h1 className="text-xl font-semibold text-slate-900">{invoice.company.name}</h1>
              {invoice.company.addressLines.length > 0 && (
                <div className="mt-1 text-sm text-slate-600">
                  {invoice.company.addressLines.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              )}
              {locationLine ? <p className="text-sm text-slate-600">{locationLine}</p> : null}
              {invoice.company.taxId ? (
                <p className="text-sm text-slate-600">Tax ID: {invoice.company.taxId}</p>
              ) : null}
              {invoice.company.email ? (
                <p className="text-sm text-slate-600">{invoice.company.email}</p>
              ) : null}
              {invoice.company.phone ? (
                <p className="text-sm text-slate-600">{invoice.company.phone}</p>
              ) : null}
            </div>
          </div>
          <div className="text-left sm:text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Invoice</p>
            <p className="text-2xl font-bold text-slate-900">#{invoice.invoiceNumber}</p>
            <span
              className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusClasses}`}
            >
              {statusLabel}
            </span>
            {invoice.overdueDays != null && invoice.overdueDays > 0 ? (
              <p className="mt-2 text-sm font-medium text-rose-700">
                {invoice.overdueDays === 1
                  ? "1 day overdue"
                  : `${invoice.overdueDays} days overdue`}
              </p>
            ) : null}
          </div>
        </header>

        <section className="mb-6 grid gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Bill to</p>
            <p className="mt-1 font-semibold text-slate-900">{invoice.client.name}</p>
            {invoice.client.company ? (
              <p className="text-sm text-slate-600">{invoice.client.company}</p>
            ) : null}
          </div>
          <div className="space-y-2 text-sm text-slate-700 sm:text-right">
            <p>
              <span className="font-medium text-slate-500">Issue date: </span>
              {formatDateOnlyField(invoice.issueDate)}
            </p>
            <p>
              <span className="font-medium text-slate-500">Due date: </span>
              {invoice.dueDate ? formatDateOnlyField(invoice.dueDate) : "—"}
            </p>
            <p>
              <span className="font-medium text-slate-500">Payment terms: </span>
              {invoice.paymentTermsLabel}
            </p>
          </div>
        </section>

        <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3 font-medium">Item</th>
                  <th className="px-4 py-3 font-medium text-right">Qty</th>
                  <th className="px-4 py-3 font-medium text-right">Rate</th>
                  <th className="px-4 py-3 font-medium text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {invoice.lineItems.map((item, index) => (
                  <tr key={`${item.name}-${index}`} className="border-b border-slate-100">
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{item.name}</p>
                      {item.description ? (
                        <p className="text-xs text-slate-500">{item.description}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {item.quantity}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-slate-700">
                      {formatCurrency(item.unitPrice, currencyOpts)}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums font-medium text-slate-900">
                      {formatCurrency(item.lineTotal, currencyOpts)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mb-6 flex justify-end">
          <dl className="w-full max-w-sm space-y-2 text-sm">
            <div className="flex justify-between text-slate-600">
              <dt>Subtotal</dt>
              <dd className="tabular-nums">{formatCurrency(financials.subtotal, currencyOpts)}</dd>
            </div>
            {financials.discountAmount > 0 ? (
              <div className="flex justify-between text-slate-600">
                <dt>Discount</dt>
                <dd className="tabular-nums">
                  -{formatCurrency(financials.discountAmount, currencyOpts)}
                </dd>
              </div>
            ) : null}
            {financials.taxAmount > 0 ? (
              <div className="flex justify-between text-slate-600">
                <dt>Tax</dt>
                <dd className="tabular-nums">{formatCurrency(financials.taxAmount, currencyOpts)}</dd>
              </div>
            ) : null}
            <div className="flex justify-between border-t border-slate-200 pt-2 text-base font-semibold text-slate-900">
              <dt>Total</dt>
              <dd className="tabular-nums">{formatCurrency(financials.total, currencyOpts)}</dd>
            </div>
            {financials.amountPaid > 0 ? (
              <div className="flex justify-between text-emerald-700">
                <dt>Paid</dt>
                <dd className="tabular-nums">
                  {formatCurrency(financials.amountPaid, currencyOpts)}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between text-base font-bold text-slate-900">
              <dt>Amount due</dt>
              <dd className="tabular-nums">
                {formatCurrency(financials.outstanding, currencyOpts)}
              </dd>
            </div>
          </dl>
        </section>

        <div className="grid gap-4 md:grid-cols-2">
          {invoice.notes ? (
            <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-sm font-semibold text-slate-800">Notes</h2>
              <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{invoice.notes}</p>
            </section>
          ) : null}
          <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-sm font-semibold text-slate-800">Thank you</h2>
            <p className="mt-2 whitespace-pre-line text-sm text-slate-700">{invoice.thankYouNote}</p>
          </section>
        </div>

        <div className="mt-4">
          <PaymentDetailsBlock
            details={invoice.paymentDetails}
            instructionLines={invoice.paymentInstructionLines}
          />
        </div>

        <footer className="mt-10 border-t border-slate-200 pt-6 text-center text-xs text-slate-500">
          Powered by{" "}
          <a
            href="https://arrexia.app"
            className="font-medium text-slate-600 hover:text-slate-900"
            rel="noopener noreferrer"
            target="_blank"
          >
            Arrexia
          </a>
        </footer>
      </div>
    </div>
  );
}
