"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { useToast } from "@/components/ui/use-toast";
import { extendWorkspaceTrialAction, markWorkspaceRenewedAction } from "../actions";
import { Button } from "@/components/ui/button";

export function AdminRenewalActions({ workspaceId }: { workspaceId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            const result = await extendWorkspaceTrialAction(workspaceId, 7);
            if (result.ok) {
              toast({ title: "Trial extended", description: "+7 days" });
              router.refresh();
            } else {
              toast({ variant: "destructive", title: "Failed", description: result.error });
            }
          });
        }}
      >
        Extend trial
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={isPending}
        onClick={() => {
          startTransition(async () => {
            const result = await markWorkspaceRenewedAction(workspaceId);
            if (result.ok) {
              toast({ title: "Marked renewed", description: "+30 day period" });
              router.refresh();
            } else {
              toast({ variant: "destructive", title: "Failed", description: result.error });
            }
          });
        }}
      >
        Mark renewed
      </Button>
      <Button size="sm" variant="ghost" disabled title="Renewal email coming soon">
        Send renewal email
      </Button>
    </div>
  );
}
