"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { paymentSettingsSchema, type PaymentSettingsFormValues } from "@/lib/schemas/settings";
import { savePaymentSettings } from "../actions";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { SettingsCard } from "./SettingsCard";
import type { WorkspaceSettings } from "@/lib/settings/loadSettings";

interface PaymentSettingsFormProps {
  workspaceId: string;
  settings: WorkspaceSettings;
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

export function PaymentSettingsForm({
  workspaceId,
  settings,
}: PaymentSettingsFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<PaymentSettingsFormValues>({
    resolver: zodResolver(paymentSettingsSchema),
    defaultValues: {
      defaultCurrency: settings.payments.defaultCurrency,
      defaultPaymentTermsDays: settings.payments.defaultPaymentTermsDays,
    },
  });

  const onSubmit = async (values: PaymentSettingsFormValues) => {
    const result = await savePaymentSettings(workspaceId, values);
    if (result.success) {
      router.refresh();
      toast({
        title: "Settings saved",
        description: "Payment settings updated successfully",
      });
    } else {
      toast({
        variant: "destructive",
        title: "Error",
        description: result.error || "Failed to update payment settings",
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <SettingsCard
        title="Invoice defaults"
        description="Set default currency and payment terms for new invoices."
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
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Default Currency *
          </label>
          <select
            {...register("defaultCurrency")}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          >
            {CURRENCIES.map((currency) => (
              <option key={currency.value} value={currency.value}>
                {currency.label}
              </option>
            ))}
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Default currency for new invoices and payments
          </p>
          {errors.defaultCurrency && (
            <p className="mt-1 text-xs text-red-600">{errors.defaultCurrency.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Default Payment Terms (days) *
          </label>
          <input
            type="number"
            {...register("defaultPaymentTermsDays", { valueAsNumber: true })}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            min="0"
            max="365"
          />
          <p className="mt-1 text-xs text-slate-500">
            Used as the default due date offset for new invoices.
          </p>
          {errors.defaultPaymentTermsDays && (
            <p className="mt-1 text-xs text-red-600">{errors.defaultPaymentTermsDays.message}</p>
          )}
        </div>
      </SettingsCard>
    </form>
  );
}

