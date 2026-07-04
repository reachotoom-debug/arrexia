"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { paymentSettingsSchema, type PaymentSettingsFormValues } from "@/lib/schemas/settings";
import { savePaymentSettings } from "../actions";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { ScrollTabStrip } from "@/components/layout/ScrollTabStrip";
import { cn } from "@/lib/utils";
import { SettingsCard } from "./SettingsCard";
import { LogoUploader } from "@/components/settings/LogoUploader";
import type { WorkspaceSettings } from "@/lib/settings/loadSettings";

interface BrandingInvoiceSettingsFormProps {
  workspaceId: string;
  settings: WorkspaceSettings;
}

const allowedCurrencies = ["USD", "EUR", "GBP", "JOD", "AED", "SAR", "EGP"] as const;
type AllowedCurrency = (typeof allowedCurrencies)[number];

function toAllowedCurrency(v: string | null | undefined): AllowedCurrency | undefined {
  if (!v || typeof v !== "string") return undefined;
  return allowedCurrencies.includes(v as AllowedCurrency) ? (v as AllowedCurrency) : undefined;
}

const CURRENCIES = [
  { value: "USD", label: "USD - US Dollar" },
  { value: "EUR", label: "EUR - Euro" },
  { value: "GBP", label: "GBP - British Pound" },
  { value: "JOD", label: "JOD - Jordanian Dinar" },
  { value: "AED", label: "AED - UAE Dirham" },
  { value: "SAR", label: "SAR - Saudi Riyal" },
  { value: "EGP", label: "EGP - Egyptian Pound" },
];

type BrandTab = "invoice" | "payments" | "thankyou";

export function BrandingInvoiceSettingsForm({
  workspaceId,
  settings,
}: BrandingInvoiceSettingsFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [tab, setTab] = useState<BrandTab>("invoice");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<PaymentSettingsFormValues>({
    shouldUnregister: false,
    resolver: zodResolver(paymentSettingsSchema) as any,
    defaultValues: {
      defaultCurrency: toAllowedCurrency(settings.payments.defaultCurrency) ?? "USD",

      workspaceDisplayName: settings.branding.businessName || "",
      brandingBusinessLegalName: settings.branding.businessLegalName || "",
      brandingLogoUrl: settings.branding.logoUrl || "",
      brandingBusinessAddress: settings.branding.businessAddress || "",
      businessEmail: settings.branding.businessEmail || "",
      brandingBusinessPhone: settings.branding.businessPhone || "",
      brandingWebsite: settings.branding.website || "",
      brandingTaxId: settings.branding.taxId || "",

      paymentBankName: settings.paymentDetails.bankName || "",
      paymentBankAccountName: settings.paymentDetails.bankAccountName || "",
      paymentBankAccountNumber: settings.paymentDetails.bankAccountNumber || "",
      paymentBankSwift: settings.paymentDetails.bankSwift || "",
      paymentBankIban: settings.paymentDetails.bankIban || "",
      paymentPaypalHandle: settings.paymentDetails.paypalHandle || "",
      paymentStripeDescriptor: settings.paymentDetails.stripeDescriptor || "",
      paymentOtherInstructions: settings.paymentDetails.otherInstructions || "",

      invoiceThankYouNote: settings.invoice.thankYouNote || "",
    },
  });

  const onSubmit = async (values: PaymentSettingsFormValues) => {
    const result = await savePaymentSettings(workspaceId, values);
    if (result.success) {
      router.refresh();
      toast({
        title: "Settings saved",
        description: "Branding and invoice settings updated successfully",
      });
    } else {
      toast({
        variant: "destructive",
        title: "Error",
        description: result.error || "Failed to update settings",
      });
    }
  };

  const saveFooter = (
    <div className="flex justify-end">
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isSubmitting ? "Saving..." : "Save Changes"}
      </button>
    </div>
  );

  const tabBtn = (active: boolean) =>
    cn(
      "shrink-0 whitespace-nowrap border-b-2 px-2 py-3 text-sm font-medium transition-colors",
      active
        ? "border-blue-500 text-blue-600"
        : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
    );

  return (
    <form onSubmit={handleSubmit(onSubmit as any)} className="w-full max-w-5xl space-y-6">
      <ScrollTabStrip aria-label="Branding and invoice sections">
        <button type="button" className={tabBtn(tab === "invoice")} onClick={() => setTab("invoice")}>
          Invoice & currency
        </button>
        <button type="button" className={tabBtn(tab === "payments")} onClick={() => setTab("payments")}>
          Payment details
        </button>
        <button type="button" className={tabBtn(tab === "thankyou")} onClick={() => setTab("thankyou")}>
          Thank-you text
        </button>
      </ScrollTabStrip>

      <SettingsCard footer={saveFooter}>
        <input type="hidden" {...register("brandingBusinessAddress")} />
        <input type="hidden" {...register("businessEmail")} />
        <input type="hidden" {...register("brandingBusinessPhone")} />
        <input type="hidden" {...register("brandingWebsite")} />
        <input type="hidden" {...register("brandingTaxId")} />
        {tab === "invoice" && (
        <div className="grid gap-8 md:gap-10">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Basic information</h3>
            <p className="mt-1 text-xs text-slate-500">
              Used for new invoices and payments. Existing records keep their currency.
            </p>
            <div className="mt-3">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Default Currency *
              </label>
              <select
                {...register("defaultCurrency")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-600"
              >
                {CURRENCIES.map((currency) => (
                  <option key={currency.value} value={currency.value}>
                    {currency.label}
                  </option>
                ))}
              </select>
              {errors.defaultCurrency && (
                <p className="mt-1 text-xs text-red-600">{errors.defaultCurrency.message}</p>
              )}
            </div>
          </div>

          <div className="border-t border-slate-100 pt-6">
            <h3 className="text-sm font-semibold text-slate-900">Branding</h3>
            <div className="mt-3 grid grid-cols-1 gap-6 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Business display name
                </label>
                <input
                  type="text"
                  {...register("workspaceDisplayName")}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-600"
                  placeholder="e.g. Arrexia"
                />
                {errors.workspaceDisplayName && (
                  <p className="mt-1 text-xs text-red-600">{errors.workspaceDisplayName.message}</p>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Business legal name (optional)
                </label>
                <input
                  type="text"
                  {...register("brandingBusinessLegalName")}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-600"
                  placeholder="e.g. Arrexia LLC"
                />
                {errors.brandingBusinessLegalName && (
                  <p className="mt-1 text-xs text-red-600">{errors.brandingBusinessLegalName.message}</p>
                )}
              </div>

              <div className="md:col-span-2">
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Logo
                </label>
                <input type="hidden" {...register("brandingLogoUrl")} />
                <LogoUploader
                  workspaceId={workspaceId}
                  value={watch("brandingLogoUrl") || null}
                  onChange={(url) =>
                    setValue("brandingLogoUrl", url, { shouldValidate: true, shouldDirty: true })
                  }
                />
                <p className="mt-1 text-xs text-slate-500">
                  Shown on invoices, PDFs, and client-facing emails.
                </p>
                {errors.brandingLogoUrl && (
                  <p className="mt-1 text-xs text-red-600">{errors.brandingLogoUrl.message}</p>
                )}
              </div>

            </div>
          </div>
        </div>
        )}

        {tab === "payments" && (
        <div className="grid gap-6">
          <h3 className="text-sm font-semibold text-slate-900">Payment details</h3>
          <p className="text-xs text-slate-500">
            Shown on invoices so clients know how to pay you.
          </p>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Bank name</label>
              <input
                type="text"
                {...register("paymentBankName")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Bank account name</label>
              <input
                type="text"
                {...register("paymentBankAccountName")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">Bank account number</label>
              <input
                type="text"
                {...register("paymentBankAccountNumber")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">SWIFT</label>
              <input
                type="text"
                {...register("paymentBankSwift")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">IBAN</label>
              <input
                type="text"
                {...register("paymentBankIban")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">PayPal handle/email</label>
              <input
                type="text"
                {...register("paymentPaypalHandle")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">Stripe descriptor</label>
              <input
                type="text"
                {...register("paymentStripeDescriptor")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-600"
              />
            </div>
            <div className="md:col-span-2">
              <label className="mb-1 block text-sm font-medium text-slate-700">
                Other payment instructions
              </label>
              <textarea
                rows={4}
                {...register("paymentOtherInstructions")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-600"
                placeholder="Any additional instructions (e.g. reference to include, payment links, etc.)"
              />
              <p className="mt-1 text-xs text-slate-500">
                Leave blank to use the default on invoices: &ldquo;Please complete
                payment using the payment details above.&rdquo;
              </p>
            </div>
          </div>
        </div>
        )}

        {tab === "thankyou" && (
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Invoice thank-you text</h3>
          <p className="mt-1 text-xs text-slate-500">
            Appears at the bottom of invoices and PDFs.
          </p>
          <div className="mt-3 grid grid-cols-1 gap-6">
            <textarea
              rows={6}
              {...register("invoiceThankYouNote")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-600"
              placeholder="Thank you for your business. Please contact us if you have any questions about this invoice."
            />
          </div>
        </div>
        )}
      </SettingsCard>
    </form>
  );
}
