"use client";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toggleReminderRuleEnabled } from "../actions";
import { useToast } from "@/components/ui/use-toast";

interface ReminderRuleToggleProps {
  workspaceId: string;
  ruleId: string;
  enabled: boolean;
}

export function ReminderRuleToggle({
  workspaceId,
  ruleId,
  enabled,
}: ReminderRuleToggleProps) {
  const [isEnabled, setIsEnabled] = useState(enabled);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  const { toast } = useToast();

  const handleToggle = () => {
    const nextEnabled = !isEnabled;
    setIsEnabled(nextEnabled);

    startTransition(async () => {
      const result = await toggleReminderRuleEnabled(workspaceId, ruleId, nextEnabled);

      if (!result.success) {
        // Rollback on error
        setIsEnabled(!nextEnabled);
        toast({
          variant: "destructive",
          title: "Could not update rule",
          description: result.error || "Please try again.",
        });
      } else {
        router.refresh();
        toast({
          title: "Settings saved",
          description: `Rule ${nextEnabled ? "enabled" : "disabled"} successfully.`,
        });
      }
    });
  };

  return (
    <button
      onClick={handleToggle}
      disabled={isPending}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors disabled:opacity-50 ${
        isEnabled ? "bg-blue-600" : "bg-slate-200"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          isEnabled ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}
