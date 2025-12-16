"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { sendReminderAction } from "@/app/[workspaceId]/reminders/actions";

type SendReminderButtonProps = {
  workspaceId: string;
  invoiceId: string;
  templateId?: string | null;
  ruleId?: string | null;
};

export function SendReminderButton({
  workspaceId,
  invoiceId,
  templateId,
  ruleId,
}: SendReminderButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleClick = async () => {
    setIsLoading(true);

    const res = await sendReminderAction({
      workspaceId,
      invoiceId,
      explicitTemplateId: templateId ?? null,
    });

    if (!res.ok) {
      alert(res.message);
      setIsLoading(false);
      return;
    }

    alert(res.message);

    // Refresh server data so the row disappears from Suggested and History updates
    router.refresh();
    setIsLoading(false);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isLoading}
      className={`text-sm ${
        isLoading
          ? "text-slate-400 cursor-not-allowed"
          : "text-blue-600 hover:text-blue-700"
      }`}
    >
      {isLoading ? "Sending..." : "Send"}
    </button>
  );
}

