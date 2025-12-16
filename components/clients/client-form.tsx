"use client";

import { useState, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { clientSchema, type ClientFormValues } from "@/lib/schemas/client";
import { countries } from "@/lib/utils/countries";
import { paymentTermsOptions } from "@/lib/utils/payment-terms";

interface ClientFormProps {
  workspaceId: string;
  initialValues?: Partial<ClientFormValues> & { id?: string };
  onSubmit: (values: ClientFormValues) => Promise<void>;
  onCancel: () => void;
}

export default function ClientForm({
  workspaceId,
  initialValues,
  onSubmit,
  onCancel,
}: ClientFormProps) {
  const [customPaymentTerms, setCustomPaymentTerms] = useState(false);
  const [customDays, setCustomDays] = useState<number | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<ClientFormValues>({
    resolver: zodResolver(clientSchema),
    defaultValues: initialValues || {
      status: "active",
      country: "United States",
      payment_terms: 30,
    },
  });

  const paymentTerms = watch("payment_terms");

  // Initialize custom payment terms if needed
  useEffect(() => {
    if (initialValues?.payment_terms !== undefined) {
      const isCustom = !paymentTermsOptions.find(
        (opt) => opt.value === initialValues.payment_terms
      );
      if (isCustom) {
        setCustomPaymentTerms(true);
        setCustomDays(initialValues.payment_terms || null);
      }
    }
  }, [initialValues]);

  const handlePaymentTermsChange = (value: string) => {
    if (value === "custom") {
      setCustomPaymentTerms(true);
      setValue("payment_terms", customDays || 0);
    } else {
      setCustomPaymentTerms(false);
      setValue("payment_terms", parseInt(value, 10));
    }
  };

  const handleCustomDaysChange = (value: number) => {
    setCustomDays(value);
    setValue("payment_terms", value);
  };


  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      {/* Client Information */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-4">
          Client Information
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Name *
            </label>
            <input
              type="text"
              {...register("name")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-slate-500">e.g. John Smith</p>
            {errors.name && (
              <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Company
            </label>
            <input
              type="text"
              {...register("company")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-slate-500">e.g. Acme Inc.</p>
            {errors.company && (
              <p className="mt-1 text-xs text-red-600">
                {errors.company.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Contact Details */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-4">
          Contact Details
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <input
              type="email"
              {...register("email")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-slate-500">e.g. john@acme.com</p>
            {errors.email && (
              <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              WhatsApp
            </label>
            <input
              type="text"
              {...register("whatsapp")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            />
            <p className="mt-1 text-xs text-slate-500">e.g. +1 555 123 4567</p>
            {errors.whatsapp && (
              <p className="mt-1 text-xs text-red-600">
                {errors.whatsapp.message}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Billing Defaults */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h3 className="text-xs uppercase tracking-wide text-slate-500 font-medium mb-4">
          Billing Defaults
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Country
            </label>
            <div className="relative">
              <select
                {...register("country")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              >
                {countries.map((country) => (
                  <option key={country.code} value={country.name}>
                    {country.flag} {country.name}
                  </option>
                ))}
              </select>
            </div>
            <p className="mt-1 text-xs text-slate-500">Select country</p>
            {errors.country && (
              <p className="mt-1 text-xs text-red-600">{errors.country.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Payment Terms
            </label>
            <select
              value={
                customPaymentTerms
                  ? "custom"
                  : paymentTerms?.toString() || "30"
              }
              onChange={(e) => handlePaymentTermsChange(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            >
              {paymentTermsOptions.map((option) => (
                <option key={option.value} value={option.value.toString()}>
                  {option.label}
                </option>
              ))}
              <option value="custom">Custom</option>
            </select>
            {customPaymentTerms && (
              <input
                type="number"
                min="0"
                value={customDays || ""}
                onChange={(e) =>
                  handleCustomDaysChange(parseInt(e.target.value, 10) || 0)
                }
                className="w-full mt-2 rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                placeholder="Enter days"
              />
            )}
            <p className="mt-1 text-xs text-slate-500">
              Select default payment terms for this client
            </p>
            {errors.payment_terms && (
              <p className="mt-1 text-xs text-red-600">
                {errors.payment_terms.message}
              </p>
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
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">Client status</p>
            {errors.status && (
              <p className="mt-1 text-xs text-red-600">{errors.status.message}</p>
            )}
          </div>
        </div>
      </div>

      <div className="flex gap-3 pt-4 border-t border-slate-200">
        <button
          type="submit"
          disabled={isSubmitting}
          className="flex-1 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? "Saving..." : initialValues?.id ? "Update" : "Create"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
