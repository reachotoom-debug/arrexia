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
  onGoToRules?: () => void;
}

export function ReminderSettingsForm({
  workspaceId,
  settings,
  onGoToRules,
}: ReminderSettingsFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<ReminderSettingsFormValues>({
    resolver: zodResolver(reminderSettingsSchema) as any,
    defaultValues: {
      enableAutomatic: settings.reminders.enableAutomatic,
    },
  });

  const onSubmit = async (values: ReminderSettingsFormValues) => {
    const result = await saveReminderSettings(workspaceId, values);
    if (result.success) {
      router.refresh();
      toast({
        title: "Settings saved",
        description: "Reminder automation updated successfully",
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
        <div>
          <h3 className="text-sm font-semibold text-slate-900">Automation</h3>
          <p className="mt-1 text-xs text-slate-500">
            Control whether Arrexia automatically sends eligible reminders on
            your schedule. Timing and templates are configured in Rules and
            Templates.
          </p>
        </div>
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
            Automatically send eligible reminders according to the enabled
            reminder rules configured in the Rules tab.
          </p>
          <p className="mt-2 text-xs text-slate-500 ml-6">
            When automation is off, suggested reminders remain available for
            manual sending.
          </p>
        </div>

        {onGoToRules ? (
          <div>
            <button
              type="button"
              onClick={onGoToRules}
              className="text-sm font-semibold text-blue-600 underline underline-offset-4 hover:text-blue-700"
            >
              Manage reminder rules
            </button>
          </div>
        ) : null}
      </SettingsCard>
    </form>
  );
}
