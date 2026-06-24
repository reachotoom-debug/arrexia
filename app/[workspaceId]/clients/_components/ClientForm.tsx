/* eslint-disable react-hooks/incompatible-library */
"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ClientFormSchema,
  type ClientFormValues,
} from "@/lib/clients/schema";
import { countries } from "@/lib/utils/countries";
import { useState, useEffect } from "react";
import { useToast } from "@/components/ui/use-toast";
import { PLAN_LIMIT_CLIENTS_MESSAGE } from "@/lib/billing/assertWithinPlanLimits";

interface ClientFormProps {
  mode: "create" | "edit";
  initialData?: ClientFormValues;
  onSubmit: (values: ClientFormValues) => Promise<{ ok: boolean; redirectTo?: string; message?: string; code?: string }>;
  workspaceId: string;
  cancelUrl?: string;
}

const PAYMENT_TERMS_OPTIONS = [
  { value: "0", label: "Due on Receipt" },
  { value: "7", label: "Net 7" },
  { value: "15", label: "Net 15" },
  { value: "30", label: "Net 30" },
  { value: "45", label: "Net 45" },
  { value: "60", label: "Net 60" },
  { value: "custom", label: "Custom" },
];

export function ClientForm({
  mode,
  initialData,
  onSubmit,
  workspaceId,
  cancelUrl,
}: ClientFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const isEdit = mode === "edit";
  const [isCustomPaymentTerms, setIsCustomPaymentTerms] = useState(false);
  const [customDays, setCustomDays] = useState<string>("");

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(ClientFormSchema),
    defaultValues: {
      name: initialData?.name ?? "",
      email: initialData?.email ?? "",
      phone: initialData?.phone ?? "",
      company: initialData?.company ?? "",
      country: initialData?.country ?? "United States",
      paymentTerms: initialData?.paymentTerms ?? "30",
      status: initialData?.status ?? "active",
      notes: initialData?.notes ?? "",
    },
  });

  const paymentTerms = watch("paymentTerms");

  // Check if initial payment terms is custom
  useEffect(() => {
    if (initialData?.paymentTerms) {
      const isCustom = !PAYMENT_TERMS_OPTIONS.find(
        (opt) => opt.value === initialData.paymentTerms
      );
      if (isCustom) {
        setIsCustomPaymentTerms(true);
        setCustomDays(initialData.paymentTerms);
      }
    }
  }, [initialData]);

  const handlePaymentTermsChange = (value: string) => {
    if (value === "custom") {
      setIsCustomPaymentTerms(true);
      setValue("paymentTerms", customDays || "30");
    } else {
      setIsCustomPaymentTerms(false);
      setValue("paymentTerms", value);
    }
  };

  const submitHandler = async (values: ClientFormValues) => {
    try {
      const result = await onSubmit(values);
      
      if (result.ok) {
        // Success: redirect if redirectTo is provided
        if (result.redirectTo) {
          router.push(result.redirectTo);
        } else if (isEdit) {
          // For edit mode without redirectTo, show success toast
          toast({
            title: "Client updated",
            description: "The client has been updated successfully.",
          });
        }
        console.log("[ClientForm] submit successful", { mode: isEdit ? "edit" : "create" });
      } else {
        const description =
          result.code === "PLAN_LIMIT_CLIENTS"
            ? PLAN_LIMIT_CLIENTS_MESSAGE
            : result.message || "Failed to save client";
        toast({
          variant: "destructive",
          title: isEdit ? "Update failed" : "Creation failed",
          description,
        });
      }
    } catch (error: unknown) {
      console.error("[ClientForm] submit failed", error);
      const rawMessage = error instanceof Error ? error.message : "Failed to save client";
      const errorMessage =
        rawMessage === "PLAN_LIMIT_CLIENTS" ? PLAN_LIMIT_CLIENTS_MESSAGE : rawMessage;
      toast({
        variant: "destructive",
        title: isEdit ? "Update failed" : "Creation failed",
        description: errorMessage,
      });
      // Re-throw to prevent navigation on error
      throw error;
    }
  };

  return (
    <form
      onSubmit={handleSubmit(submitHandler)}
      className="mx-auto w-full max-w-2xl min-w-0 space-y-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">
            {isEdit ? "Edit Client" : "Create Client"}
          </h1>
          <p className="text-sm text-slate-500">
            {isEdit
              ? "Update client information"
              : "Add a new client to your workspace"}
          </p>
        </div>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => {
              router.push(cancelUrl ?? `/${workspaceId}/clients`);
            }}
            className="inline-flex items-center rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-200"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting}
            className="inline-flex items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-60"
          >
            {isSubmitting
              ? isEdit
                ? "Saving..."
                : "Creating..."
              : isEdit
              ? "Save Changes"
              : "Create Client"}
          </button>
        </div>
      </div>

      {/* Form Fields */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="grid gap-4 md:grid-cols-2">
          {/* Name */}
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              {...register("name")}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. John Smith"
            />
            <p className="mt-1 text-xs text-slate-500">e.g. John Smith</p>
            {errors.name && (
              <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
            )}
          </div>

          {/* Email */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Email
            </label>
            <input
              type="email"
              {...register("email")}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. john@company.com"
            />
            <p className="mt-1 text-xs text-slate-500">e.g. john@company.com</p>
            {errors.email && (
              <p className="mt-1 text-xs text-red-600">
                {errors.email.message}
              </p>
            )}
          </div>

          {/* Phone/WhatsApp */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Phone / WhatsApp
            </label>
            <input
              type="text"
              {...register("phone")}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. +1 555 123 4567"
            />
            <p className="mt-1 text-xs text-slate-500">e.g. +1 555 123 4567</p>
            {errors.phone && (
              <p className="mt-1 text-xs text-red-600">
                {errors.phone.message}
              </p>
            )}
          </div>

          {/* Company */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Company
            </label>
            <input
              type="text"
              {...register("company")}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Acme Inc."
            />
            <p className="mt-1 text-xs text-slate-500">e.g. Acme Inc.</p>
            {errors.company && (
              <p className="mt-1 text-xs text-red-600">
                {errors.company.message}
              </p>
            )}
          </div>

          {/* Country */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Country <span className="text-red-500">*</span>
            </label>
            <select
              {...register("country")}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {countries.map((country) => (
                <option key={country.code} value={country.name}>
                  {country.flag} {country.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-500">Select country</p>
            {errors.country && (
              <p className="mt-1 text-xs text-red-600">
                {errors.country.message}
              </p>
            )}
          </div>

          {/* Payment Terms */}
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">
              Payment Terms <span className="text-red-500">*</span>
            </label>
            {!isCustomPaymentTerms ? (
              <select
                {...register("paymentTerms")}
                onChange={(e) => handlePaymentTermsChange(e.target.value)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {PAYMENT_TERMS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <div className="flex gap-2">
                <input
                  type="number"
                  value={customDays}
                  onChange={(e) => {
                    setCustomDays(e.target.value);
                    setValue("paymentTerms", e.target.value);
                  }}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Days"
                  min="0"
                />
                <button
                  type="button"
                  onClick={() => {
                    setIsCustomPaymentTerms(false);
                    setValue("paymentTerms", "30");
                  }}
                  className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
              </div>
            )}
            <p className="mt-1 text-xs text-slate-500">
              Select default payment terms for this client
            </p>
            {errors.paymentTerms && (
              <p className="mt-1 text-xs text-red-600">
                {errors.paymentTerms.message}
              </p>
            )}
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
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">Client status</p>
            {errors.status && (
              <p className="mt-1 text-xs text-red-600">
                {errors.status.message}
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
              placeholder="Optional notes about this client"
            />
            <p className="mt-1 text-xs text-slate-500">
              Optional notes about this client
            </p>
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

