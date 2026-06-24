/* eslint-disable react-hooks/incompatible-library */
"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { invoiceSchema, type InvoiceFormValues } from "@/lib/schemas/invoice";
import { currencies } from "@/lib/utils/currencies";
import { formatCurrency } from "@/lib/format/currency";

interface Client {
  id: string;
  name: string;
  payment_terms?: number | null;
}

interface InvoiceFormProps {
  workspaceId: string;
  clients: Client[];
  initialValues?: Partial<InvoiceFormValues> & { id?: string };
  onSubmit: (values: InvoiceFormValues) => Promise<void>;
  onCancel?: () => void;
}

export default function InvoiceForm({
  workspaceId,
  clients,
  initialValues,
  onSubmit,
  onCancel,
}: InvoiceFormProps) {
  const router = useRouter();
  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: initialValues || {
      status: "draft",
      currency: "USD",
      items: [{ name: "", description: "", quantity: 1, unit_price: 0 }],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "items",
  });

  const selectedClientId = watch("client_id");
  const issueDate = watch("issue_date");
  const items = watch("items");

  // Auto-calculate due date from client payment terms
  useEffect(() => {
    if (selectedClientId && issueDate && !initialValues?.due_date) {
      const client = clients.find((c) => c.id === selectedClientId);
      if (client?.payment_terms !== null && client?.payment_terms !== undefined) {
        const issue = new Date(issueDate);
        issue.setDate(issue.getDate() + client.payment_terms);
        const dueDate = issue.toISOString().split("T")[0];
        setValue("due_date", dueDate);
      }
    }
  }, [selectedClientId, issueDate, clients, setValue, initialValues]);

  const subtotal = items.reduce(
    (sum, item) => sum + (item.quantity || 0) * (item.unit_price || 0),
    0
  );

  const selectedCurrency = watch("currency") || "USD";

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Client Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-4">
          Client
        </h3>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Client *
          </label>
          <select
            {...register("client_id")}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          >
            <option value="">Select a client</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Select the client for this invoice
          </p>
          {errors.client_id && (
            <p className="mt-1 text-xs text-red-600">{errors.client_id.message}</p>
          )}
        </div>
      </div>

      {/* Invoice Information */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-4">
          Invoice Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Invoice Number *
            </label>
            <input
              type="text"
              {...register("invoice_number")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-slate-500">e.g. INV-2024-001</p>
            {errors.invoice_number && (
              <p className="mt-1 text-xs text-red-600">
                {errors.invoice_number.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              PO Number
            </label>
            <input
              type="text"
              {...register("po_number")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-slate-500">
              Purchase order number (optional)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Issue Date *
            </label>
            <input
              type="date"
              {...register("issue_date")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-slate-500">Date invoice was issued</p>
            {errors.issue_date && (
              <p className="mt-1 text-xs text-red-600">{errors.issue_date.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Due Date *
            </label>
            <input
              type="date"
              {...register("due_date")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-slate-500">
              Payment due date (auto-calculated from client payment terms)
            </p>
            {errors.due_date && (
              <p className="mt-1 text-xs text-red-600">{errors.due_date.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Currency *
            </label>
            <select
              {...register("currency")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            >
              {currencies.map((curr) => (
                <option key={curr.code} value={curr.code}>
                  {curr.code} - {curr.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">Invoice currency</p>
            {errors.currency && (
              <p className="mt-1 text-xs text-red-600">{errors.currency.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Status
            </label>
            <select
              {...register("status")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            >
              <option value="draft">Draft</option>
              <option value="sent">Sent</option>
              <option value="overdue">Overdue</option>
              <option value="partially_paid">Partially Paid</option>
              <option value="paid">Paid</option>
              <option value="void">Void</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">Invoice status</p>
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium">
            Line Items
          </h3>
          <button
            type="button"
            onClick={() => append({ name: "", description: "", quantity: 1, unit_price: 0 })}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
          >
            + Add Line Item
          </button>
        </div>

        <div className="space-y-3">
          {fields.map((field, index) => (
            <div
              key={field.id}
              className="grid grid-cols-12 gap-3 p-4 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 transition-colors"
            >
              <div className="col-span-4">
                <input
                  type="text"
                  {...register(`items.${index}.name`)}
                  placeholder="Item name *"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white"
                />
                <p className="mt-1 text-xs text-slate-500">e.g. Website hosting</p>
                {errors.items?.[index]?.name && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.items[index]?.name?.message}
                  </p>
                )}
              </div>
              <div className="col-span-3">
                <input
                  type="text"
                  {...register(`items.${index}.description`)}
                  placeholder="Description (optional)"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white"
                />
                {errors.items?.[index]?.description && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.items[index]?.description?.message}
                  </p>
                )}
              </div>
              <div className="col-span-1">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  {...register(`items.${index}.quantity`, { valueAsNumber: true })}
                  placeholder="Qty"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white"
                />
                {errors.items?.[index]?.quantity && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.items[index]?.quantity?.message}
                  </p>
                )}
              </div>
              <div className="col-span-1">
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  {...register(`items.${index}.unit_price`, { valueAsNumber: true })}
                  placeholder="Price"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent bg-white"
                />
                {errors.items?.[index]?.unit_price && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.items[index]?.unit_price?.message}
                  </p>
                )}
              </div>
              <div className="col-span-2 flex items-center justify-end">
                <span className="text-sm font-medium text-slate-900">
                  {formatCurrency(
                    (items[index]?.quantity || 0) * (items[index]?.unit_price || 0),
                    { currency: selectedCurrency }
                  )}
                </span>
              </div>
              <div className="col-span-1 flex items-center justify-end">
                {fields.length > 1 && (
                  <button
                    type="button"
                    onClick={() => remove(index)}
                    className="text-red-600 hover:text-red-800 transition-colors"
                    aria-label="Remove item"
                  >
                    <svg
                      className="w-5 h-5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
                    </svg>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        {errors.items && typeof errors.items === "object" && "message" in errors.items && (
          <p className="mt-2 text-xs text-red-600">{errors.items.message}</p>
        )}

        {/* Summary */}
        <div className="mt-6 pt-6 border-t border-slate-200">
          <div className="flex justify-end">
            <div className="w-full max-w-xs space-y-2">
              <div className="flex justify-between text-sm text-slate-600">
                <span>Subtotal:</span>
                <span className="font-medium text-slate-900">
                  {formatCurrency(subtotal, { currency: selectedCurrency })}
                </span>
              </div>
              <div className="flex justify-between text-lg font-semibold text-slate-900 pt-2 border-t border-slate-200">
                <span>Total:</span>
                <span>{formatCurrency(subtotal, { currency: selectedCurrency })}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-4">
          Notes
        </h3>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Internal Notes
          </label>
          <textarea
            {...register("notes")}
            rows={4}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            placeholder="Add any internal notes about this invoice..."
          />
          <p className="mt-1 text-xs text-slate-500">
            These notes are not visible to the client
          </p>
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t border-slate-200">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting
            ? "Saving..."
            : initialValues?.id
              ? "Update Invoice"
              : "Create Invoice"}
        </button>
        <button
          type="button"
          onClick={() => {
            if (onCancel) {
              onCancel();
            } else {
              router.push(`/${workspaceId}/invoices`);
            }
          }}
          className="flex-1 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
