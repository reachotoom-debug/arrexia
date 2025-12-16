"use client";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { reminderSettingsSchema, type ReminderSettingsFormValues } from "@/lib/schemas/settings";
import { saveReminderSettings } from "../actions";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/use-toast";
import { SettingsCard } from "./SettingsCard";
import type { WorkspaceSettings } from "@/lib/settings/loadSettings";

interface ReminderSettingsFormProps {
  workspaceId: string;
  settings: WorkspaceSettings;
}

export function ReminderSettingsForm({
  workspaceId,
  settings,
}: ReminderSettingsFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ReminderSettingsFormValues>({
    resolver: zodResolver(reminderSettingsSchema),
    defaultValues: {
      enableAutomatic: settings.reminders.enableAutomatic,
      afterDueDays: settings.reminders.afterDueDays,
      beforeDueDays: settings.reminders.beforeDueDays,
      defaultChannel: settings.reminders.defaultChannel,
    },
  });

  const onSubmit = async (values: ReminderSettingsFormValues) => {
    const result = await saveReminderSettings(workspaceId, values);
    if (result.success) {
      router.refresh();
      toast({
        title: "Settings saved",
        description: "Reminder settings updated successfully",
      });
    } else {
      toast({
        variant: "destructive",
        title: "Error",
        description: result.error || "Failed to update reminder settings",
      });
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <SettingsCard
        title="Automatic reminders"
        description="Control when and how FlowCollect sends reminder emails."
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
          <label className="flex items-center">
            <input
              type="checkbox"
              {...register("enableAutomatic")}
              className="mr-2"
            />
            <span className="text-sm font-medium text-slate-700">
              Enable automatic reminders
            </span>
          </label>
          <p className="mt-1 text-xs text-slate-500 ml-6">
            Automatically send reminder emails based on your reminder rules
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Before Due Date (days)
            </label>
            <input
              type="number"
              {...register("beforeDueDays", { valueAsNumber: true })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              min="0"
              max="365"
            />
            <p className="mt-1 text-xs text-slate-500">
              Days before due date
            </p>
            {errors.beforeDueDays && (
              <p className="mt-1 text-xs text-red-600">
                {errors.beforeDueDays.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              After Due Date (days)
            </label>
            <input
              type="number"
              {...register("afterDueDays", { valueAsNumber: true })}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              min="0"
              max="365"
            />
            <p className="mt-1 text-xs text-slate-500">
              Days after due date
            </p>
            {errors.afterDueDays && (
              <p className="mt-1 text-xs text-red-600">
                {errors.afterDueDays.message}
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Default Channel
            </label>
            <select
              {...register("defaultChannel")}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            >
              <option value="email">Email</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
            <p className="mt-1 text-xs text-slate-500">
              Default delivery channel
            </p>
            {errors.defaultChannel && (
              <p className="mt-1 text-xs text-red-600">{errors.defaultChannel.message}</p>
            )}
          </div>
        </div>
      </SettingsCard>
    </form>
  );
}

