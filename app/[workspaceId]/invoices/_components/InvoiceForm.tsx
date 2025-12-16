"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  InvoiceFormSchema,
  type InvoiceFormValues,
  type InvoiceItemFormValues,
} from "@/lib/invoices/schema";
import { computeInvoiceTotals } from "@/lib/invoices/totals";
import { formatMoney } from "@/lib/utils/format-money";
import { calculateDueDate, deriveDaysFromTerms } from "@/lib/invoices/paymentTerms";

interface InvoiceFormProps {
  mode: "create" | "edit";
  initialData?: InvoiceFormValues;
  clients: { id: string; name: string; company?: string | null }[];
  onSubmit: (values: InvoiceFormValues) => Promise<void>;
  generatedInvoiceNumber?: string; // pass from server for create
  workspaceId: string;
  cancelUrl?: string; // e.g. `/${workspaceId}/invoices`
  isPaid?: boolean; // If true, disable line item editing
  prefilledClient?: { id: string; name: string; company?: string | null } | null;
  initialClientId?: string;
}

export function InvoiceForm({
  mode,
  initialData,
  clients,
  onSubmit,
  generatedInvoiceNumber,
  workspaceId,
  cancelUrl,
  isPaid = false,
  prefilledClient,
  initialClientId,
}: InvoiceFormProps) {
  const router = useRouter();
  const isEdit = mode === "edit";
  const [submitMode, setSubmitMode] = useState<
    "default" | "draft" | "sent"
  >("default");
  const [isDueDateManuallyEdited, setIsDueDateManuallyEdited] = useState(false);

  const defaultValues: InvoiceFormValues = useMemo(
    () =>
      initialData ?? {
        clientId: initialClientId ?? "",
        invoiceNumber: generatedInvoiceNumber ?? "INV-0001",
        issueDate: new Date().toISOString().slice(0, 10),
        dueDate: new Date().toISOString().slice(0, 10),
        poNumber: "",
        notes: "",
        status: "draft",
        paymentTerms: "net_30",
        paymentTermsDays: undefined,
        discountPercent: 0,
        taxPercent: 0,
        items: [
          {
            name: "",
            description: "",
            quantity: 1,
            unit_price: 0,
          } as InvoiceItemFormValues,
        ],
      },
    [initialData, generatedInvoiceNumber, initialClientId]
  );

  const {
    register,
    control,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
    setValue,
  } = useForm<InvoiceFormValues>({
    resolver: zodResolver(InvoiceFormSchema),
    defaultValues,
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });

  const watchItems = watch("items");
  const discountPercent = watch("discountPercent") || 0;
  const taxPercent = watch("taxPercent") || 0;

  const totals = computeInvoiceTotals(
    watchItems as InvoiceItemFormValues[],
    discountPercent,
    taxPercent
  );

  // Ensure invoiceNumber is read-only & locked in edit mode
  useEffect(() => {
    if (isEdit && initialData?.invoiceNumber) {
      setValue("invoiceNumber", initialData.invoiceNumber);
    }
  }, [isEdit, initialData, setValue]);

  // Watch for changes to issue date, payment terms, and payment terms days
  const issueDate = watch("issueDate");
  const paymentTerms = watch("paymentTerms");
  const paymentTermsDays = watch("paymentTermsDays");

  // Auto-calculate due date when issue date or payment terms change
  useEffect(() => {
    // Guard: don't calculate if issueDate is empty or user manually edited due date
    if (!issueDate || isDueDateManuallyEdited || !paymentTerms) {
      return;
    }

    const calculatedDueDate = calculateDueDate(
      issueDate,
      paymentTerms,
      paymentTermsDays
    );

    // Only set if calculation succeeded (not null)
    if (calculatedDueDate) {
      setValue("dueDate", calculatedDueDate);
    }
  }, [issueDate, paymentTerms, paymentTermsDays, isDueDateManuallyEdited, setValue]);

  // Track manual due date edits
  const handleDueDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setIsDueDateManuallyEdited(true);
    setValue("dueDate", e.target.value);
  };

  const submitHandler = async (values: InvoiceFormValues) => {
    try {
      console.log("[InvoiceForm] submitHandler called with values:", values);
      
      let finalStatus = values.status;

      if (mode === "create") {
        if (submitMode === "draft") {
          finalStatus = "draft";
        } else if (submitMode === "sent") {
          finalStatus = "sent";
        } else if (!finalStatus) {
          finalStatus = "draft";
        }
      }

      const finalValues: InvoiceFormValues = {
        ...values,
        status: finalStatus,
      };

      await onSubmit(finalValues);
      console.log("[InvoiceForm] onSubmit completed successfully");
    } catch (error) {
      console.error("[InvoiceForm] submit failed", error);
      // Optionally, later we can add a toast/snackbar.
    }
  };

  return (
    <form
      onSubmit={handleSubmit(submitHandler)}
      className="space-y-6 max-w-5xl mx-auto"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {isEdit ? "Edit Invoice" : "Create Invoice"}
          </h1>
          <p className="text-sm text-slate-500">
            Manage invoice details, line items, and totals.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              router.push(cancelUrl ?? `/${workspaceId}/invoices`);
            }}
            className="inline-flex items-center rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-200"
          >
            Cancel
          </button>
          {mode === "edit" ? (
            <button
              type="submit"
              disabled={isSubmitting}
              className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
              onClick={() => setSubmitMode("default")}
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={isSubmitting}
                onClick={() => setSubmitMode("draft")}
                className="inline-flex items-center rounded-lg bg-slate-800 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-slate-900 disabled:opacity-60"
              >
                {isSubmitting && submitMode === "draft"
                  ? "Saving..."
                  : "Save as Draft"}
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                onClick={() => setSubmitMode("sent")}
                className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
              >
                {isSubmitting && submitMode === "sent"
                  ? "Sending..."
                  : "Save & Mark as Sent"}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Invoice + Client Info */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">
            Invoice Details
          </h2>

          <div>
            <label className="block text-xs font-medium text-slate-600">
              Invoice #
            </label>
            <input
              {...register("invoiceNumber")}
              readOnly
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
            />
            {errors.invoiceNumber && (
              <p className="mt-1 text-xs text-red-600">
                {errors.invoiceNumber.message}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600">
                Issue Date
              </label>
              <input
                type="date"
                {...register("issueDate")}
                onChange={(e) => {
                  register("issueDate").onChange(e);
                  setIsDueDateManuallyEdited(false);
                }}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              {errors.issueDate && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.issueDate.message}
                </p>
              )}
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600">
                Due Date
              </label>
              <input
                type="date"
                {...register("dueDate")}
                onChange={handleDueDateChange}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              />
              {errors.dueDate && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.dueDate.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600">
                Payment Terms
              </label>
              <select
                {...register("paymentTerms")}
                onChange={(e) => {
                  register("paymentTerms").onChange(e);
                  setIsDueDateManuallyEdited(false);
                }}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="net_7">Net 7</option>
                <option value="net_15">Net 15</option>
                <option value="net_30">Net 30</option>
                <option value="net_45">Net 45</option>
                <option value="net_60">Net 60</option>
                <option value="due_on_receipt">Due on Receipt</option>
                <option value="custom">Custom</option>
              </select>
              {errors.paymentTerms && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.paymentTerms.message}
                </p>
              )}
            </div>
            {paymentTerms === "custom" && (
              <div>
                <label className="block text-xs font-medium text-slate-600">
                  Custom Days
                </label>
                <input
                  type="number"
                  step="1"
                  min="0"
                  {...register("paymentTermsDays", {
                    valueAsNumber: true,
                  })}
                  onChange={(e) => {
                    register("paymentTermsDays").onChange(e);
                    setIsDueDateManuallyEdited(false);
                  }}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                  placeholder="Days"
                />
                {errors.paymentTermsDays && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.paymentTermsDays.message}
                  </p>
                )}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600">
              PO Number
            </label>
            <input
              {...register("poNumber")}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Optional"
            />
          </div>

          {mode === "edit" ? (
            <div>
              <label className="block text-xs font-medium text-slate-600">
                Status
              </label>
              <select
                {...register("status")}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="void">Void</option>
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Payment state (unpaid/partially paid/paid) and overdue status are automatically calculated from payments.
              </p>
              {errors.status && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.status.message}
                </p>
              )}
            </div>
          ) : (
            <div>
              <label className="block text-xs font-medium text-slate-600">
                Status
              </label>
              <div className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                Status will be set based on the button you click (Draft or Sent)
              </div>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
          <h2 className="text-sm font-semibold text-slate-700">Client</h2>

          <div>
            <label className="block text-xs font-medium text-slate-600">
              Client
            </label>
            {prefilledClient ? (
              // Locked mode: show read-only display
              <>
                <input
                  type="hidden"
                  {...register("clientId")}
                  value={prefilledClient.id}
                />
                <div className="mt-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                  <div className="font-medium">{prefilledClient.name}</div>
                  {prefilledClient.company && (
                    <div className="text-xs text-slate-500 mt-0.5">
                      {prefilledClient.company}
                    </div>
                  )}
                </div>
              </>
            ) : (
              // Normal mode: full dropdown
              <>
                <select
                  {...register("clientId")}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <option value="">Select client...</option>
                  {clients.map((client) => (
                    <option key={client.id} value={client.id}>
                      {client.name}
                      {client.company ? ` — ${client.company}` : ""}
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

          <div>
            <label className="block text-xs font-medium text-slate-600">
              Notes
            </label>
            <textarea
              {...register("notes")}
              rows={5}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
              placeholder="Optional message shown to client"
            />
            <p className="mt-1 text-xs text-slate-500">
              This message will be visible to the client on the invoice.
            </p>
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-slate-700">Line Items</h2>
          {!isPaid && (
            <button
              type="button"
              onClick={() =>
                append({
                  name: "",
                  description: "",
                  quantity: 1,
                  unit_price: 0,
                } as InvoiceItemFormValues)
              }
              className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
            >
              <span>+</span> Add Item
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full table-auto text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="px-3 py-2 text-left">Item Name</th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-right">Qty</th>
                <th className="px-3 py-2 text-right">Unit Price</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {fields.map((field, index) => {
                const item = watchItems[index] as InvoiceItemFormValues;

                const amount = item
                  ? item.quantity * item.unit_price
                  : 0;

                return (
                  <tr
                    key={field.id}
                    className="border-b border-slate-100 align-top"
                  >
                    <td className="px-3 py-2">
                      <input
                        {...register(`items.${index}.name` as const)}
                        disabled={isPaid}
                        className={`w-full rounded-lg border border-slate-200 px-2 py-1 text-sm ${
                          isPaid ? "bg-slate-50 text-slate-500 cursor-not-allowed" : ""
                        }`}
                        placeholder="e.g. Website hosting"
                      />
                      {errors.items?.[index]?.name && (
                        <p className="mt-1 text-xs text-red-600">
                          {errors.items[index]?.name?.message}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <textarea
                        {...register(
                          `items.${index}.description` as const
                        )}
                        disabled={isPaid}
                        className={`w-full rounded-lg border border-slate-200 px-2 py-1 text-sm ${
                          isPaid ? "bg-slate-50 text-slate-500 cursor-not-allowed" : ""
                        }`}
                        rows={2}
                        placeholder="Optional description"
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step="1"
                        {...register(`items.${index}.quantity` as const, {
                          valueAsNumber: true,
                        })}
                        disabled={isPaid}
                        className={`w-20 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm ${
                          isPaid ? "bg-slate-50 text-slate-500 cursor-not-allowed" : ""
                        }`}
                      />
                      {errors.items?.[index]?.quantity && (
                        <p className="mt-1 text-xs text-red-600">
                          {errors.items[index]?.quantity?.message}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <input
                        type="number"
                        step="0.01"
                        {...register(`items.${index}.unit_price` as const, {
                          valueAsNumber: true,
                        })}
                        disabled={isPaid}
                        className={`w-24 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm ${
                          isPaid ? "bg-slate-50 text-slate-500 cursor-not-allowed" : ""
                        }`}
                      />
                      {errors.items?.[index]?.unit_price && (
                        <p className="mt-1 text-xs text-red-600">
                          {errors.items[index]?.unit_price?.message}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right align-middle">
                      <span className="text-sm text-slate-800">
                        {formatMoney(amount)}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-right align-middle">
                      {!isPaid && (
                        <button
                          type="button"
                          onClick={() => remove(index)}
                          className="inline-flex items-center justify-center w-6 h-6 rounded text-red-600 hover:text-red-700 hover:bg-red-50 transition"
                          title="Remove item"
                        >
                          ×
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}

              {fields.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-3 py-4 text-center text-sm text-slate-500"
                  >
                    No items yet. Click "Add Item" to start.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Totals */}
      <div className="flex flex-col items-end gap-3">
        <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-600">Subtotal</span>
            <span className="font-medium text-slate-900">
              {formatMoney(totals.subtotal)}
            </span>
          </div>

          <div className="flex items-center justify-between text-sm gap-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="text-slate-600">Discount (%)</span>
                <span
                  className="text-slate-400 cursor-help"
                  title="Applies to subtotal before tax"
                >
                  ℹ️
                </span>
              </div>
              <input
                type="number"
                step="1"
                {...register("discountPercent", {
                  valueAsNumber: true,
                })}
                className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm"
              />
            </div>
            <span className="text-slate-700">
              -{formatMoney(totals.discountAmount)}
            </span>
          </div>

          <div className="flex items-center justify-between text-sm gap-3">
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                <span className="text-slate-600">Tax (%)</span>
                <span
                  className="text-slate-400 cursor-help"
                  title="Applied to subtotal after discount"
                >
                  ℹ️
                </span>
              </div>
              <input
                type="number"
                step="1"
                {...register("taxPercent", {
                  valueAsNumber: true,
                })}
                className="w-20 rounded-lg border border-slate-200 px-2 py-1 text-right text-sm"
              />
            </div>
            <span className="text-slate-700">
              +{formatMoney(totals.taxAmount)}
            </span>
          </div>

          <div className="mt-2 border-t border-slate-200 pt-2 flex items-center justify-between text-sm">
            <span className="text-slate-900 font-semibold">Total</span>
            <span className="text-lg font-semibold text-slate-900">
              {formatMoney(totals.total)}
            </span>
          </div>
        </div>
      </div>
    </form>
  );
}
