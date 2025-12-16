import Link from "next/link";
import { supabaseServer } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/utils/format-money";
import { PAYMENT_TERMS_OPTIONS } from "@/lib/invoices/paymentTerms";
import { SendInvoiceButton } from "./_components/SendInvoiceButton";

const ORGANIZATION_ID = "05d2d292-d95b-44f4-b774-22f10068124f";

interface InvoicePageProps {
  params: Promise<{ workspaceId: string; invoiceId: string }>;
}

// Helper to detect if a string is a UUID
const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export default async function InvoicePage({ params }: InvoicePageProps) {
  const { workspaceId, invoiceId } = await params;
  const supabase = await supabaseServer();

  // Step 1: Load invoice with explicit columns
  // MUST filter by both workspace_id and id/invoice_number for proper access control
  // Support both UUID (id) and invoice_number for backward compatibility
  let query = supabase
    .from("invoices")
    .select(`
      id,
      workspace_id,
      client_id,
      invoice_number,
      status,
      issue_date,
      due_date,
      currency,
      amount,
      total_paid,
      outstanding_amount,
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
      updated_at
    `)
    .eq("workspace_id", workspaceId);

  // Use id field if invoiceId is a UUID, otherwise use invoice_number
  if (isUuid(invoiceId)) {
    query = query.eq("id", invoiceId);
  } else {
    query = query.eq("invoice_number", invoiceId);
  }

  const { data: invoice, error: invoiceError } = await query.single();

  if (invoiceError || !invoice) {
    console.error("[InvoicePage] invoice load error:", {
      workspaceId,
      invoiceId,
      error: invoiceError,
      message: (invoiceError as any)?.message,
      code: (invoiceError as any)?.code,
      details: (invoiceError as any)?.details,
      hint: (invoiceError as any)?.hint,
      hasInvoice: !!invoice,
    });
    
    // Provide more specific error message
    if (invoiceError) {
      const errorMessage = (invoiceError as any)?.message || "Unknown error";
      const errorCode = (invoiceError as any)?.code || "unknown";
      throw new Error(`Failed to load invoice: ${errorMessage} (code: ${errorCode})`);
    }
    
    throw new Error(`Invoice not found: ${invoiceId} in workspace ${workspaceId}`);
  }

  // Step 2: Load client separately (no nested relations)
  let client = null;
  if (invoice.client_id) {
    const { data: clientData } = await supabase
      .from("clients")
      .select("*")
      .eq("id", invoice.client_id)
      .single();
    client = clientData;
  }

  // Fetch workspace settings for "From" section
  const { data: workspaceRow } = await supabase
    .from("workspaces")
    .select("name, profile_image_url")
    .eq("id", workspaceId)
    .maybeSingle();

  const { data: settings } = await supabase
    .from("settings")
    .select("workspace_display_name, workspace_logo_url, business_email, business_phone, business_address_line1, business_address_line2, business_city, business_state, business_postal_code")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  // Build workspace info from both tables
  const workspace = workspaceRow ? {
    name: settings?.workspace_display_name || workspaceRow.name || "Workspace",
    email: settings?.business_email || null,
    phone: settings?.business_phone || null,
    address: [
      settings?.business_address_line1,
      settings?.business_address_line2,
      settings?.business_city,
      settings?.business_state,
      settings?.business_postal_code,
    ].filter(Boolean).join(", ") || null,
  } : null;

  // Step 3: Load invoice items separately
  const { data: itemRows, error: itemsError } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("position", { ascending: true });

  if (itemsError) {
    console.error("[InvoicePage] invoice_items load error:", {
      raw: itemsError,
      message: (itemsError as any)?.message,
      code: (itemsError as any)?.code,
    });
  }

  const items = itemRows ?? [];

  // Step 4: Load payments separately
  const { data: payments, error: paymentsError } = await supabase
    .from("payments")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("payment_date", { ascending: false });

  if (paymentsError) {
    console.error("[InvoicePage] payments load error:", {
      raw: paymentsError,
      message: (paymentsError as any)?.message,
      code: (paymentsError as any)?.code,
    });
  }

  // Step 5: Load invoice delivery logs
  const { data: deliveryLogs, error: deliveryLogsError } = await supabase
    .from("invoice_delivery_logs")
    .select("*")
    .eq("invoice_id", invoiceId)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: false });

  const hasRealDeliveryLogsError =
    deliveryLogsError &&
    typeof deliveryLogsError === "object" &&
    Object.keys(deliveryLogsError as any).length > 0;

  if (hasRealDeliveryLogsError) {
    console.error(
      "[InvoicePage] delivery logs load error:",
      deliveryLogsError
    );
  }

  const currency = invoice.currency || "USD";
  const lineItems = items;
  const paymentList = payments ?? [];
  // Always use safe array, even if query fails
  const deliveryHistory = deliveryLogs ?? [];

  // Use stored money values from database (source of truth)
  // Do NOT recalculate - use what's stored for consistency with PDF and list views
  const subtotal = Number(invoice.subtotal ?? 0);
  const discount = Number(invoice.discount_amount ?? 0);
  const tax = Number(invoice.tax_amount ?? 0);
  const total = Number(invoice.amount ?? 0);
  const paid = Number(invoice.total_paid ?? 0);
  const outstanding = Number(invoice.outstanding_amount ?? 0);

  // Get percentages for display
  const discountPercent = Number(invoice.discount_percent ?? 0);
  const taxPercent = Number(invoice.tax_percent ?? 0);

  // Determine payment status using stored values
  const paymentStatus =
    outstanding <= 0
      ? "paid"
      : paid > 0
      ? "partial"
      : new Date(invoice.due_date) < new Date() && invoice.status !== "paid"
      ? "overdue"
      : invoice.status;

  const statusLabel = (paymentStatus || "").toLowerCase();
  const statusClass =
    statusLabel === "paid"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : statusLabel === "overdue"
      ? "bg-red-50 text-red-700 border-red-200"
      : statusLabel === "sent"
      ? "bg-blue-50 text-blue-700 border-blue-200"
      : statusLabel === "partial"
      ? "bg-amber-50 text-amber-700 border-amber-200"
      : statusLabel === "void"
      ? "bg-slate-100 text-slate-500 border-slate-200"
      : "bg-slate-50 text-slate-700 border-slate-200";

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

  // Build timeline events
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
      description: `Payment of ${formatMoney(Number(payment.amount), currency)} recorded`,
    })),
  ]
    .filter((event) => event.date) // Filter out events with null/undefined dates
    .sort((a, b) => {
      const dateA = a.date ? new Date(a.date).getTime() : 0;
      const dateB = b.date ? new Date(b.date).getTime() : 0;
      return dateB - dateA;
    });

  return (
    <div className="max-w-5xl mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-slate-400">
            Invoice
          </p>
          <h1 className="text-2xl font-semibold text-slate-900">
            {invoice.invoice_number}
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <span
              className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${statusClass}`}
            >
              {invoice.status}
            </span>
            {paymentStatus !== invoice.status && (
              <span className="text-xs text-slate-500">
                ({paymentStatus === "paid" ? "Fully Paid" : paymentStatus === "partial" ? "Partially Paid" : paymentStatus === "overdue" ? "Overdue" : ""})
              </span>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/${workspaceId}/invoices/${invoice.id}/edit`}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Edit Invoice
          </Link>
          <Link
            href={`/${workspaceId}/invoices/new?clone=${invoice.id}`}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Clone Invoice
          </Link>
          <Link
            href={`/${workspaceId}/invoices/${invoice.id}/pdf`}
            className="inline-flex items-center rounded-lg bg-slate-900 px-3 py-2 text-xs font-medium text-white shadow-sm hover:bg-slate-800"
          >
            Download PDF
          </Link>
          <SendInvoiceButton
            workspaceId={workspaceId}
            invoiceId={invoice.id}
            clientEmail={client?.email}
            invoiceNumber={invoice.invoice_number}
          />
        </div>
      </div>

      {/* From / Bill To */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-1">
          <h2 className="text-sm font-semibold text-slate-700">From</h2>
          <p className="text-sm font-medium text-slate-900">
            {workspace?.name || "FlowCollect"}
          </p>
          {workspace?.email && (
            <p className="text-sm text-slate-500">{workspace.email}</p>
          )}
          {workspace?.phone && (
            <p className="text-sm text-slate-500">{workspace.phone}</p>
          )}
          {workspace?.address && (
            <p className="text-sm text-slate-500">{workspace.address}</p>
          )}
          {!workspace && (
            <p className="text-sm text-slate-400 italic">
              Workspace information not configured
            </p>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-1">
          <h2 className="text-sm font-semibold text-slate-700">Bill To</h2>
          <p className="text-sm font-medium text-slate-900">
            {client?.name ?? "Client"}
          </p>
          {client?.company && (
            <p className="text-sm text-slate-700">{client.company}</p>
          )}
          {client?.email && (
            <p className="text-sm text-slate-500">{client.email}</p>
          )}
          {client?.country && (
            <p className="text-sm text-slate-500">{client.country}</p>
          )}
        </div>
      </div>

      {/* Invoice Details & Summary */}
      <div className="grid gap-4 md:grid-cols-2">
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
            <div className="flex justify-between">
              <dt className="text-slate-500">Payment Terms</dt>
              <dd>
                {(() => {
                  const termsOption = PAYMENT_TERMS_OPTIONS.find(
                    (opt) => opt.code === invoice.payment_terms
                  );
                  let termsLabel = termsOption?.label ?? "Custom";
                  
                  if (invoice.payment_terms === "custom" && invoice.payment_terms_days != null) {
                    termsLabel = `Custom (${invoice.payment_terms_days} days)`;
                  }
                  
                  return termsLabel;
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

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-2">Summary</h2>
          <dl className="space-y-1 text-sm text-slate-700">
            <div className="flex justify-between">
              <dt className="text-slate-500">Subtotal</dt>
              <dd>{formatMoney(subtotal, currency)}</dd>
            </div>
            {discountPercent > 0 && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Discount ({discountPercent}%)</dt>
                <dd>-{formatMoney(discount, currency)}</dd>
              </div>
            )}
            {taxPercent > 0 && (
              <div className="flex justify-between">
                <dt className="text-slate-500">Tax ({taxPercent}%)</dt>
                <dd>{formatMoney(tax, currency)}</dd>
              </div>
            )}
            <div className="mt-2 border-t border-slate-200 pt-2 flex justify-between">
              <dt className="text-slate-700 font-medium">Total</dt>
              <dd className="text-slate-900 font-semibold">
                {formatMoney(total, currency)}
              </dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-slate-500">Amount Paid</dt>
              <dd className="text-emerald-600">
                {formatMoney(paid, currency)}
              </dd>
            </div>
            <div className="mt-2 border-t border-slate-200 pt-2 flex justify-between">
              <dt className="text-slate-700 font-medium">Outstanding</dt>
              <dd
                className={`font-semibold ${
                  outstanding > 0
                    ? "text-red-600"
                    : outstanding < 0
                    ? "text-emerald-600"
                    : "text-slate-900"
                }`}
              >
                {formatMoney(Math.abs(outstanding), currency)}
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
                const amount =
                  Number(item.quantity) * Number(item.unit_price);
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
                    <td className="px-3 py-2 text-right">{item.quantity}</td>
                    <td className="px-3 py-2 text-right">
                      {formatMoney(Number(item.unit_price), currency)}
                    </td>
                    <td className="px-3 py-2 text-right font-medium">
                      {formatMoney(amount, currency)}
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
                      {formatMoney(Number(payment.amount), currency)}
                    </td>
                    <td className="px-3 py-2 text-slate-700 capitalize">
                      {payment.method || "—"}
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
          <h2 className="text-sm font-semibold text-slate-700 mb-1">Notes</h2>
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
                <div className="font-medium text-slate-900">{event.event}</div>
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

      {/* Thank you / footer */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-1">
            Thank you
          </h2>
          <p className="text-sm text-slate-700">
            Thank you for your business. Please contact us if you have any
            questions about this invoice.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold text-slate-700 mb-1">
            Payment details
          </h2>
          <p className="text-sm text-slate-700">
            You can add your bank details, payment link, or instructions here
            later.
          </p>
        </div>
      </div>
    </div>
  );
}
