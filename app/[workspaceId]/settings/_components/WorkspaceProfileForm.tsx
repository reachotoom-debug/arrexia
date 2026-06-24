/* eslint-disable react-hooks/incompatible-library */
"use client";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { workspaceProfileSchema, type WorkspaceProfileFormValues } from "@/lib/schemas/settings";
import { saveWorkspaceProfile } from "../actions";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { SettingsCard } from "./SettingsCard";
import type { WorkspaceSettings } from "@/lib/settings/loadSettings";
import { TIMEZONE_OPTIONS } from "@/lib/timezones";
import {
  buildCountrySelectOptions,
  buildTimezoneSelectOptions,
} from "../_lib/workspaceLocationOptions";

interface WorkspaceProfileFormProps {
  workspaceId: string;
  settings: WorkspaceSettings;
}

export function WorkspaceProfileForm({
  workspaceId,
  settings,
}: WorkspaceProfileFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<WorkspaceProfileFormValues>({
    resolver: zodResolver(workspaceProfileSchema) as any,
    defaultValues: {
      name: settings.workspace.name,
      logoUrl: settings.workspace.logoUrl || "",
      phone: settings.workspace.phone || "",
      country: settings.workspace.country || "",
      taxNumber: settings.workspace.taxNumber || "",
      email: settings.workspace.email || "",
      website: settings.workspace.website || "",
      addressLine1: settings.workspace.addressLine1 || "",
      addressLine2: settings.workspace.addressLine2 || "",
      city: settings.workspace.city || "",
      state: settings.workspace.state || "",
      postalCode: settings.workspace.postalCode || "",
      timezone: settings.timezone || "",
    },
  });

  useEffect(() => {
    setValue("logoUrl", settings.workspace.logoUrl || "", { shouldValidate: false });
  }, [settings.workspace.logoUrl, setValue]);

  const watchedCountry = watch("country");
  const watchedTimezone = watch("timezone");
  const countrySelectOptions = buildCountrySelectOptions(watchedCountry);
  const timezoneSelectOptions = buildTimezoneSelectOptions(TIMEZONE_OPTIONS, watchedTimezone);

  const onSubmit = async (values: WorkspaceProfileFormValues) => {
    // Ensure all values are strings (not FileList or File objects)
    // The schema should handle validation, but we sanitize here for safety
    const safeValues: WorkspaceProfileFormValues = {
      name: String(values.name || ""),
      logoUrl: typeof values.logoUrl === "string" ? values.logoUrl : "",
      phone: typeof values.phone === "string" ? values.phone : "",
      country: typeof values.country === "string" ? values.country : "",
      taxNumber: typeof values.taxNumber === "string" ? values.taxNumber : "",
      email: typeof values.email === "string" ? values.email : "",
      website: typeof values.website === "string" ? values.website : "",
      addressLine1: typeof values.addressLine1 === "string" ? values.addressLine1 : "",
      addressLine2: typeof values.addressLine2 === "string" ? values.addressLine2 : "",
      city: typeof values.city === "string" ? values.city : "",
      state: typeof values.state === "string" ? values.state : "",
      postalCode: typeof values.postalCode === "string" ? values.postalCode : "",
      timezone: typeof values.timezone === "string" ? values.timezone : "",
    };

    const result = await saveWorkspaceProfile(workspaceId, safeValues);
    if (result.success) {
      router.refresh();
      toast({
        title: "Settings saved",
        description: "Workspace profile updated successfully",
      });
    } else {
      toast({
        variant: "destructive",
        title: "Error",
        description: result.error || "Failed to update workspace profile",
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit as any)} className="w-full max-w-5xl">
      <SettingsCard
        footer={
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </button>
          </div>
        }
      >
        <input type="hidden" {...register("logoUrl")} />
        <div className="space-y-8">
          {/* Basic information */}
          <div>
            <h3 className="mb-4 text-sm font-semibold text-slate-900">Basic information</h3>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Workspace Name *
                </label>
                <input
                  type="text"
                  {...register("name")}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  placeholder="My Workspace"
                />
                {errors.name && (
                  <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Timezone
                </label>
                <select
                  {...register("timezone")}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                >
                  <option value="">Select timezone (optional)</option>
                  {timezoneSelectOptions.map((tz) => (
                    <option key={tz.value} value={tz.value}>
                      {tz.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  Used for date/time display in the app. Stored as an IANA timezone (e.g.{" "}
                  <span className="font-mono">Europe/London</span>).
                </p>
                {errors.timezone && (
                  <p className="mt-1 text-xs text-red-600">{errors.timezone.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Contact information */}
          <div>
            <h3 className="mb-4 text-sm font-semibold text-slate-900">Contact information</h3>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  {...register("email")}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  placeholder="business@example.com"
                />
                {errors.email && (
                  <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Phone
                </label>
                <input
                  type="text"
                  {...register("phone")}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  placeholder="+1 (555) 123-4567"
                />
                {errors.phone && (
                  <p className="mt-1 text-xs text-red-600">{errors.phone.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Website
                </label>
                <input
                  type="url"
                  {...register("website")}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  placeholder="https://example.com"
                />
                {errors.website && (
                  <p className="mt-1 text-xs text-red-600">{errors.website.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Tax details */}
          <div>
            <h3 className="mb-4 text-sm font-semibold text-slate-900">Tax details</h3>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Tax Number
                </label>
                <input
                  type="text"
                  {...register("taxNumber")}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  placeholder="TAX-123456"
                />
                {errors.taxNumber && (
                  <p className="mt-1 text-xs text-red-600">{errors.taxNumber.message}</p>
                )}
              </div>
            </div>
          </div>

          {/* Address */}
          <div>
            <h3 className="mb-4 text-sm font-semibold text-slate-900">Address</h3>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Country
                </label>
                <select
                  {...register("country")}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                >
                  <option value="">Select country (optional)</option>
                  {countrySelectOptions.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
                {errors.country && (
                  <p className="mt-1 text-xs text-red-600">{errors.country.message}</p>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Address Line 1
                </label>
                <input
                  type="text"
                  {...register("addressLine1")}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  placeholder="123 Main Street"
                />
                {errors.addressLine1 && (
                  <p className="mt-1 text-xs text-red-600">{errors.addressLine1.message}</p>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Address Line 2
                </label>
                <input
                  type="text"
                  {...register("addressLine2")}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  placeholder="Suite 100"
                />
                {errors.addressLine2 && (
                  <p className="mt-1 text-xs text-red-600">{errors.addressLine2.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  City
                </label>
                <input
                  type="text"
                  {...register("city")}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  placeholder="City in selected country"
                />
                {errors.city && (
                  <p className="mt-1 text-xs text-red-600">{errors.city.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  State / Province
                </label>
                <input
                  type="text"
                  {...register("state")}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  placeholder="NY"
                />
                {errors.state && (
                  <p className="mt-1 text-xs text-red-600">{errors.state.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Postal Code
                </label>
                <input
                  type="text"
                  {...register("postalCode")}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  placeholder="10001"
                />
                {errors.postalCode && (
                  <p className="mt-1 text-xs text-red-600">{errors.postalCode.message}</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </SettingsCard>
    </form>
  );
}

