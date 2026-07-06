"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { adminCreateWorkspaceForUserAction } from "@/app/admin/actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";

type AdminCreateWorkspaceButtonProps = {
  userId: string;
  userLabel: string;
};

export function AdminCreateWorkspaceButton({
  userId,
  userLabel,
}: AdminCreateWorkspaceButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={isPending}
      onClick={() => {
        startTransition(async () => {
          const result = await adminCreateWorkspaceForUserAction(userId);
          if (result.ok) {
            toast({
              title: "Workspace created",
              description: `Workspace provisioned for ${userLabel}.`,
            });
            router.refresh();
            return;
          }

          toast({
            variant: "destructive",
            title: "Workspace creation failed",
            description: result.error ?? "Unable to create workspace.",
          });
        });
      }}
    >
      Create workspace
    </Button>
  );
}
