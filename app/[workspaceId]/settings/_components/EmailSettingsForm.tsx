"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { emailSettingsSchema, type EmailSettingsFormValues } from "@/lib/schemas/settings";
import { saveEmailSettings, testEmailSettings } from "../actions";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useToast } from "@/components/ui/use-toast";
import { SettingsCard } from "./SettingsCard";
import type { WorkspaceSettings } from "@/lib/settings/loadSettings";

interface EmailSettingsFormProps {
  workspaceId: string;
  settings: WorkspaceSettings;
}

export function EmailSettingsForm({
  workspaceId,
  settings,
}: EmailSettingsFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isTestingEmail, setIsTestingEmail] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<EmailSettingsFormValues>({
    resolver: zodResolver(emailSettingsSchema) as any,
    defaultValues: {
      provider: settings.email.provider,
      fromName: settings.email.fromName,
      fromEmail: settings.email.fromEmail,
      smtpHost: settings.email.smtpHost || "",
      smtpPort: settings.email.smtpPort?.toString() || "" as any,
      smtpUser: settings.email.smtpUser || "",
      smtpPassword: "", // Don't pre-fill password
      smtpUseTls: settings.email.smtpUseTls ?? true,
    },
  });

  const selectedProvider = watch("provider");

  const onSubmit = async (values: EmailSettingsFormValues) => {
    const result = await saveEmailSettings(workspaceId, values);
    if (result.success) {
      router.refresh();
      toast({
        title: "Email settings saved.",
        description: "Your email settings were updated.",
      });
    } else {
      toast({
        variant: "destructive",
        title: "Error",
        description: result.error || "Failed to update email settings",
      });
    }
  };

  const handleTestEmail = async () => {
    setIsTestingEmail(true);
    try {
      const result = await testEmailSettings(workspaceId);
      if (result.success) {
        toast({
          title: "Test email sent",
          description: "Please check your inbox.",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.error || "Failed to send test email",
        });
      }
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Error",
        description: "An error occurred while sending test email",
      });
    } finally {
      setIsTestingEmail(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit as any)} className="w-full max-w-5xl">
      <SettingsCard
        footer={
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              {selectedProvider === "resend" ? "Using Resend" : "Using custom SMTP"}
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleTestEmail}
                disabled={isTestingEmail || isSubmitting}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {isTestingEmail ? "Sending..." : "Send Test Email"}
              </button>
              <button
                type="submit"
                disabled={isSubmitting || isTestingEmail}
                className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
              >
                {isSubmitting ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        }
      >
        {/* Email provider */}
        <div>
          <h3 className="mb-3 text-sm font-semibold text-slate-900">Email provider</h3>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Email Provider *
          </label>
          <div className="flex gap-4">
            <label className="flex items-center">
              <input
                type="radio"
                value="resend"
                {...register("provider")}
                className="mr-2"
              />
              <span className="text-sm text-slate-700">Resend</span>
            </label>
            <label className="flex items-center">
              <input
                type="radio"
                value="smtp"
                {...register("provider")}
                className="mr-2"
              />
              <span className="text-sm text-slate-700">SMTP</span>
            </label>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            Choose your email sending provider. Resend uses API keys from environment variables.
          </p>
        </div>

        {/* From Name & Email (common for both providers) */}
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              From Name *
            </label>
            <input
              type="text"
              {...register("fromName")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              placeholder="Your Company Name"
            />
            {errors.fromName && (
              <p className="mt-1 text-xs text-red-600">{errors.fromName.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              From Email *
            </label>
            <input
              type="email"
              {...register("fromEmail")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              placeholder="noreply@example.com"
            />
            {errors.fromEmail && (
              <p className="mt-1 text-xs text-red-600">{errors.fromEmail.message}</p>
            )}
          </div>
        </div>

        {/* SMTP-specific fields */}
        {selectedProvider === "smtp" && (
          <div className="rounded-lg border bg-muted/40 p-4 space-y-4">
            <div>
              <h3 className="text-sm font-medium text-slate-900">SMTP Settings</h3>
              <p className="text-xs text-muted-foreground mt-1">
                Only required if you use your own SMTP server.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  SMTP Host
                </label>
                <input
                  type="text"
                  {...register("smtpHost")}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  placeholder="smtp.gmail.com"
                />
                {errors.smtpHost && (
                  <p className="mt-1 text-xs text-red-600">{errors.smtpHost.message}</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  SMTP Port
                </label>
                <input
                  type="text"
                  {...register("smtpPort")}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                  placeholder="587"
                />
                {errors.smtpPort && (
                  <p className="mt-1 text-xs text-red-600">{errors.smtpPort.message}</p>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                SMTP Username
              </label>
              <input
                type="text"
                {...register("smtpUser")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                placeholder="your-email@example.com"
              />
              {errors.smtpUser && (
                <p className="mt-1 text-xs text-red-600">{errors.smtpUser.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                SMTP Password
              </label>
              <input
                type="password"
                {...register("smtpPassword")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                placeholder="Leave blank to keep current password"
                autoComplete="new-password"
              />
              <p className="mt-1 text-xs text-slate-500">
                Leave blank to keep the current password
              </p>
              {errors.smtpPassword && (
                <p className="mt-1 text-xs text-red-600">{errors.smtpPassword.message}</p>
              )}
            </div>

            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  {...register("smtpUseTls")}
                  className="mr-2"
                />
                <span className="text-sm text-slate-700">Use TLS/SSL</span>
              </label>
            </div>
          </div>
        )}

        {selectedProvider === "resend" && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
            <p className="text-xs text-blue-800">
              <strong>Resend Configuration:</strong> API keys are stored in environment variables
              (RESEND_API_KEY). The from name and from email above will be used when sending
              emails via Resend.
            </p>
          </div>
        )}
      </SettingsCard>
    </form>
  );
}

