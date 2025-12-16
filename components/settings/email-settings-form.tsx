"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  emailSettingsSchema,
  emailSettingsUpdateSchema,
  type EmailSettingsFormValues,
} from "@/lib/schemas/email-settings";
import { saveEmailSettings, testEmailSettings } from "@/app/[workspaceId]/settings/actions";
import { useToast } from "@/components/ui/use-toast";
import { useRouter } from "next/navigation";

interface EmailSettingsFormProps {
  workspaceId: string;
  initialValues: Partial<EmailSettingsFormValues> | null;
}

export default function EmailSettingsForm({
  workspaceId,
  initialValues,
}: EmailSettingsFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isTesting, setIsTesting] = useState(false);

  const isUpdate = !!initialValues;
  const schema = isUpdate ? emailSettingsUpdateSchema : emailSettingsSchema;

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<EmailSettingsFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      from_name: initialValues?.from_name ?? "",
      from_email: initialValues?.from_email ?? "",
      smtp_host: initialValues?.smtp_host ?? "",
      smtp_port: initialValues?.smtp_port ?? 587,
      smtp_username: initialValues?.smtp_username ?? "",
      smtp_password: "", // Never pre-fill password
      use_tls: initialValues?.use_tls ?? true,
    },
  });

  const onSubmit = async (values: EmailSettingsFormValues) => {
    try {
      await saveEmailSettings(workspaceId, values);
      toast({
        title: "Settings saved",
        description: "Email settings have been saved successfully.",
      });
      router.refresh();
    } catch (error) {
      toast({
        title: "Error",
        description:
          error instanceof Error
            ? error.message
            : "Failed to save email settings. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    try {
      // Get current form values
      const values = getValues();

      // Validate form values
      emailSettingsSchema.parse(values);

      // Use server action for testing
      await testEmailSettings(workspaceId, values);

      toast({
        title: "SMTP connection successful",
        description: "Successfully connected to SMTP server.",
      });
    } catch (error) {
      toast({
        title: "SMTP test failed",
        description:
          error instanceof Error
            ? error.message
            : "Failed to test SMTP connection. Please check your settings.",
        variant: "destructive",
      });
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
      <div className="rounded-xl bg-white p-6 border border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">
          Email & SMTP Settings
        </h2>
        <p className="text-sm text-slate-600 mb-6">
          Configure SMTP settings to send invoices and reminders from your
          workspace email.
        </p>

        <div className="space-y-4">
          {/* From Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              From Name *
            </label>
            <input
              type="text"
              {...register("from_name")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              placeholder="Your Company Name"
            />
            {errors.from_name && (
              <p className="mt-1 text-xs text-red-600">
                {errors.from_name.message}
              </p>
            )}
          </div>

          {/* From Email */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              From Email *
            </label>
            <input
              type="email"
              {...register("from_email")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              placeholder="noreply@yourcompany.com"
            />
            {errors.from_email && (
              <p className="mt-1 text-xs text-red-600">
                {errors.from_email.message}
              </p>
            )}
          </div>

          {/* SMTP Host */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              SMTP Host *
            </label>
            <input
              type="text"
              {...register("smtp_host")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              placeholder="smtp.gmail.com"
            />
            {errors.smtp_host && (
              <p className="mt-1 text-xs text-red-600">
                {errors.smtp_host.message}
              </p>
            )}
          </div>

          {/* SMTP Port */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              SMTP Port *
            </label>
            <input
              type="number"
              {...register("smtp_port", { valueAsNumber: true })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              placeholder="587"
            />
            {errors.smtp_port && (
              <p className="mt-1 text-xs text-red-600">
                {errors.smtp_port.message}
              </p>
            )}
          </div>

          {/* SMTP Username */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              SMTP Username *
            </label>
            <input
              type="text"
              {...register("smtp_username")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              placeholder="your-email@gmail.com"
            />
            {errors.smtp_username && (
              <p className="mt-1 text-xs text-red-600">
                {errors.smtp_username.message}
              </p>
            )}
          </div>

          {/* SMTP Password */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              SMTP Password *
            </label>
            <input
              type="password"
              {...register("smtp_password", {
                required: !isUpdate ? "SMTP password is required" : false,
                minLength: isUpdate
                  ? undefined
                  : { value: 1, message: "SMTP password is required" },
              })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
              placeholder="••••••••"
              autoComplete="new-password"
            />
            {errors.smtp_password && (
              <p className="mt-1 text-xs text-red-600">
                {errors.smtp_password.message}
              </p>
            )}
            {isUpdate && (
              <p className="mt-1 text-xs text-slate-500">
                Leave blank to keep existing password
              </p>
            )}
          </div>

          {/* Use TLS */}
          <div className="flex items-center">
            <input
              type="checkbox"
              {...register("use_tls")}
              id="use_tls"
              className="h-4 w-4 rounded border-slate-300 text-slate-900 focus:ring-2 focus:ring-slate-900"
            />
            <label
              htmlFor="use_tls"
              className="ml-2 text-sm font-medium text-slate-700"
            >
              Use TLS/SSL
            </label>
          </div>
        </div>
      </div>

      <div className="flex justify-between">
        <button
          type="button"
          onClick={handleTestConnection}
          disabled={isTesting || isSubmitting}
          className="rounded-lg border border-slate-300 bg-white px-6 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {isTesting ? "Testing..." : "Test Connection"}
        </button>
        <button
          type="submit"
          disabled={isSubmitting || isTesting}
          className="rounded-lg bg-slate-900 px-6 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? "Saving..." : "Save Settings"}
        </button>
      </div>
    </form>
  );
}

