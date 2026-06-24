"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMemo, useEffect, useState, useTransition } from "react";
import {
  PaymentFormSchema,
  type PaymentFormValues,
} from "@/lib/payments/schema";
import { formatCurrency } from "@/lib/format/currency";
import { getInvoicesForPaymentClient } from "../actions";

interface Invoice {
  id: string;
  client_id: string | null;
  invoice_number: string;
  status: string | null;
  outstanding_amount: number; // Legacy field name for backward compatibility with PaymentForm
  currency?: string;
}

interface PaymentFormProps {
  mode: "create" | "edit";
  initialData?: PaymentFormValues;
  clients: { id: string; name: string }[];
  invoices: Invoice[];
  action: (formData: FormData) => Promise<void>;
  workspaceId: string;
  cancelUrl?: string;
  invoicesError?: string; // Error message from getEligibleInvoices
  // For edit mode: display client/invoice names (read-only)
  clientName?: string;
  invoiceNumber?: string;
}

export function PaymentForm({
  mode,
  initialData,
  clients,
  invoices,
  action,
  workspaceId,
  cancelUrl,
  clientName,
  invoiceNumber,
}: PaymentFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";

  // State for lazy-loading invoices (create mode only)
  const [clientInvoices, setClientInvoices] = useState<Invoice[]>(isEdit ? invoices : []);
  const [isLoadingInvoices, startTransition] = useTransition();

  // State to track selected invoice's outstanding amount
  const [selectedInvoiceOutstanding, setSelectedInvoiceOutstanding] = useState<number | null>(null);

  const {
    register,
    watch,
    setValue,
    setError,
    clearErrors,
    reset,
    formState: { errors },
  } = useForm<PaymentFormValues>({
    resolver: zodResolver(PaymentFormSchema),
    defaultValues: initialData ?? {
      clientId: "",
      invoiceId: "",
      amount: 0,
      date: new Date().toISOString().slice(0, 10),
      method: "cash",
      status: "completed",
      transactionId: "",
      notes: "",
      payment_provider: "",
    },
  });

  // Reset form with initialData when in edit mode (ensures method/provider are preselected)
  useEffect(() => {
    if (isEdit && initialData) {
      reset(initialData);
    }
  }, [isEdit, initialData, reset]);

  const selectedClientId = watch("clientId");
  const selectedInvoiceId = watch("invoiceId");
  const amount = watch("amount");

  // Lazy-load invoices when client changes (create mode only)
  useEffect(() => {
    if (isEdit) {
      // In edit mode, use invoices from props
      setClientInvoices(invoices);
      return;
    }

    // In create mode, clear invoices when client changes
    setClientInvoices([]);
    setValue("invoiceId", "");
    setSelectedInvoiceOutstanding(null);
    clearErrors("amount");

    if (!selectedClientId) {
      return;
    }

    // Load invoices for selected client
    startTransition(async () => {
      try {
        const loadedInvoices = await getInvoicesForPaymentClient({
          workspaceId,
          clientId: selectedClientId,
        });
        setClientInvoices(loadedInvoices);
      } catch (err) {
        console.error("[PaymentForm] failed to load client invoices", err);
        setClientInvoices([]);
      }
    });
  }, [selectedClientId, workspaceId, isEdit, invoices, setValue, clearErrors]);

  // Use clientInvoices in create mode, invoices from props in edit mode
  const filteredInvoicesForClient = isEdit
    ? invoices?.filter((inv) => inv.client_id === selectedClientId) ?? []
    : clientInvoices;

  const invoice = filteredInvoicesForClient.find((inv) => inv.id === selectedInvoiceId);

  // Reset invoice when invoices list becomes empty (don't auto-select)
  useEffect(() => {
    if (filteredInvoicesForClient.length === 0 && selectedInvoiceId) {
      setValue("invoiceId", "");
      setSelectedInvoiceOutstanding(null);
      clearErrors("amount");
    }
  }, [filteredInvoicesForClient.length, selectedInvoiceId, setValue, clearErrors]);

  // Update outstanding amount when invoice is selected
  useEffect(() => {
    if (!invoice) {
      setSelectedInvoiceOutstanding(null);
      return;
    }

    const outstanding = invoice.outstanding_amount ?? 0;

    // Only update if the value changed, to avoid infinite loops
    setSelectedInvoiceOutstanding((prev) =>
      prev === outstanding ? prev : outstanding
    );

    // Clear amount error when the invoice actually changes
    clearErrors("amount");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id, invoice?.outstanding_amount, clearErrors]);

  // Validate amount against outstanding (with 0.01 tolerance for floating point precision)
  // Only apply this validation in create mode
  useEffect(() => {
    // Skip validation in edit mode (payment already exists)
    if (isEdit) {
      return;
    }
    
    if (selectedInvoiceOutstanding !== null && amount !== undefined && amount !== null) {
      const tolerance = 0.01;
      const exceedsOutstanding = amount > selectedInvoiceOutstanding + tolerance;
      
      if (exceedsOutstanding) {
        setError("amount", {
          type: "manual",
          message: `Amount cannot exceed outstanding balance of ${formatCurrency(selectedInvoiceOutstanding, { currency: invoice?.currency })}`,
        });
      } else {
        clearErrors("amount");
      }
    }
  }, [amount, selectedInvoiceOutstanding, setError, clearErrors, isEdit]);

  // Check if form is valid for submission (amount <= outstanding with tolerance)
  // Only apply this validation in create mode; edit mode allows editing existing payments
  const isFormValid = useMemo(() => {
    // In edit mode, don't enforce outstanding validation (payment already exists)
    if (isEdit) {
      return amount !== undefined && amount !== null && amount > 0;
    }
    
    // In create mode, validate against outstanding
    if (selectedInvoiceOutstanding === null || amount === undefined || amount === null) {
      return false;
    }
    const tolerance = 0.01;
    return amount <= selectedInvoiceOutstanding + tolerance && amount > 0;
  }, [amount, selectedInvoiceOutstanding, isEdit]);

  return (
    <form
      action={action}
      className="mx-auto w-full max-w-3xl min-w-0 space-y-6"
    >
      {/* In edit mode, include hidden fields for clientId/invoiceId to preserve them (server will ignore changes) */}
      {isEdit && initialData?.clientId && (
        <input type="hidden" name="clientId" value={initialData.clientId} />
      )}
      {isEdit && initialData?.invoiceId && (
        <input type="hidden" name="invoiceId" value={initialData.invoiceId} />
      )}
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {isEdit ? "Edit Payment" : "Record Payment"}
          </h1>
          <p className="text-sm text-slate-500">
            {isEdit
              ? "Update payment details"
              : "Record a new payment for an invoice"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              router.push(cancelUrl ?? `/${workspaceId}/payments`);
            }}
            className="inline-flex items-center rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!isFormValid}
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {isEdit ? "Save Changes" : "Record Payment"}
          </button>
        </div>
      </div>

      {/* Form Fields */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {/* Client */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Client <span className="text-red-500">*</span>
            </label>
            {isEdit && clientName ? (
              <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {clientName}
              </div>
            ) : (
              <>
                <select
                  {...register("clientId")}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select client...</option>
                  {/* Render all clients from props - no filtering or limiting */}
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                    </option>
                  ))}
                </select>
                {errors.clientId && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.clientId.message}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Invoice */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Invoice <span className="text-red-500">*</span>
            </label>
            {isEdit && invoiceNumber ? (
              <div className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
                {invoiceNumber}
              </div>
            ) : (
              <>
                <select
                  {...register("invoiceId")}
                  disabled={!selectedClientId || isLoadingInvoices}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-50 disabled:cursor-not-allowed disabled:text-slate-400"
                >
                  <option value="">
                    {!selectedClientId
                      ? "Select a client first"
                      : isLoadingInvoices
                      ? "Loading invoices..."
                      : filteredInvoicesForClient.length === 0
                      ? "No open invoices for this client"
                      : "Select invoice..."}
                  </option>
                  {filteredInvoicesForClient.map((invoice) => (
                    <option key={invoice.id} value={invoice.id}>
                      {invoice.invoice_number} · {formatCurrency(invoice.outstanding_amount, { currency: invoice.currency })} outstanding
                    </option>
                  ))}
                </select>
                {errors.invoiceId && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.invoiceId.message}
                  </p>
                )}
              </>
            )}
          </div>

          {/* Amount */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Amount <span className="text-red-500">*</span>
              {selectedInvoiceOutstanding !== null && (
                <span className="ml-2 text-xs text-slate-500 font-normal">
                  (Outstanding: {formatCurrency(selectedInvoiceOutstanding, { currency: invoice?.currency })})
                </span>
              )}
            </label>
            <input
              type="number"
              step="0.01"
              {...register("amount", { valueAsNumber: true })}
              className={`w-full rounded-lg border px-3 py-2 text-sm focus:outline-none focus:ring-2 ${
                errors.amount
                  ? "border-red-300 focus:ring-red-500"
                  : "border-slate-200 focus:ring-blue-500"
              }`}
              placeholder="0.00"
            />
            {errors.amount && (
              <p className="mt-1 text-xs text-red-600">
                {errors.amount.message}
              </p>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Date <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              {...register("date")}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            {errors.date && (
              <p className="mt-1 text-xs text-red-600">
                {errors.date.message}
              </p>
            )}
          </div>

          {/* Method */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Payment Method <span className="text-red-500">*</span>
            </label>
            <select
              {...register("method")}
              value={watch("method") ?? ""}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="cash">Cash</option>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="card">Card</option>
              <option value="check">Check</option>
              <option value="other">Other</option>
            </select>
            {errors.method && (
              <p className="mt-1 text-xs text-red-600">
                {errors.method.message}
              </p>
            )}
          </div>

          {/* Payment Provider */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Payment Provider
            </label>
            <select
              {...register("payment_provider")}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Select provider (optional)</option>
              <option value="Bank transfer">Bank transfer</option>
              <option value="Cash">Cash</option>
              <option value="Stripe">Stripe</option>
              <option value="PayPal">PayPal</option>
              <option value="Checkout.com">Checkout.com</option>
              <option value="Other">Other</option>
            </select>
            {errors.payment_provider && (
              <p className="mt-1 text-xs text-red-600">
                {errors.payment_provider.message}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-500">
              Optional: which provider processed this payment.
            </p>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Status <span className="text-red-500">*</span>
            </label>
            <select
              {...register("status")}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="pending">Pending</option>
              <option value="completed">Completed</option>
              <option value="failed">Failed</option>
              <option value="refunded">Refunded</option>
            </select>
            {errors.status && (
              <p className="mt-1 text-xs text-red-600">
                {errors.status.message}
              </p>
            )}
          </div>

          {/* Transaction ID */}
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Transaction ID
            </label>
            <input
              type="text"
              {...register("transactionId")}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optional transaction reference"
            />
            {errors.transactionId && (
              <p className="mt-1 text-xs text-red-600">
                {errors.transactionId.message}
              </p>
            )}
          </div>

          {/* Notes */}
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Notes
            </label>
            <textarea
              {...register("notes")}
              rows={4}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Optional notes about this payment"
            />
            {errors.notes && (
              <p className="mt-1 text-xs text-red-600">
                {errors.notes.message}
              </p>
            )}
          </div>
        </div>
      </div>
    </form>
  );
}

