"use client";

import { Eye, Pencil } from "lucide-react";
import { TableActionIconLink } from "@/components/table/TableActionIconLink";

interface ClientRowActionsProps {
  clientId: string;
  workspaceId: string;
  returnToUrl?: string;
}

export function ClientRowActions({ clientId, workspaceId, returnToUrl }: ClientRowActionsProps) {
  const editHref = returnToUrl
    ? `/${workspaceId}/clients/${clientId}/edit?returnTo=${encodeURIComponent(returnToUrl)}`
    : `/${workspaceId}/clients/${clientId}/edit`;

  return (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      <TableActionIconLink
        href={`/${workspaceId}/clients/${clientId}`}
        label="View client"
        icon={<Eye className="h-4 w-4" />}
      />
      <TableActionIconLink
        href={editHref}
        label="Edit client"
        icon={<Pencil className="h-4 w-4" />}
      />
    </div>
  );
}
