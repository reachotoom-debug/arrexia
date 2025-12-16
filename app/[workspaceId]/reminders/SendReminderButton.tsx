"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { sendReminderAction } from "./actions";

type Props = {
  workspaceId: string;
  invoiceId: string;
};

export function SendReminderButton({ workspaceId, invoiceId }: Props) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const onClick = () => {
    startTransition(async () => {
      const res = await sendReminderAction({ workspaceId, invoiceId });
      
      if (!res.ok) {
        alert(res.message);
        return;
      }

      router.refresh();
      alert(res.message);
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={isPending}
      className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isPending ? "Sending..." : "Send reminder"}
    </button>
  );
}

