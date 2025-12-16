"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { RemindersSearchInput } from "./RemindersSearchInput";
import { ResetFiltersButton } from "@/components/shared/reset-filters-button";

interface RemindersSearchAndResetProps {
  workspaceId: string;
  searchQuery: string;
}

export function RemindersSearchAndReset({
  workspaceId,
  searchQuery,
}: RemindersSearchAndResetProps) {
  return (
    <div className="flex items-center gap-2">
      <RemindersSearchInput
        workspaceId={workspaceId}
        initialSearch={searchQuery}
      />
      <ResetFiltersButton basePath={`/${workspaceId}/reminders`} />
    </div>
  );
}

