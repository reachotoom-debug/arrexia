"use client";

import { useEffect, useRef } from "react";

interface InvoicesPreferencesGateProps {
  workspaceId: string;
  searchParams: Record<string, string | string[] | undefined>;
}

/**
 * InvoicesPreferencesGate - No-op component (no persistence/redirect logic)
 * 
 * This component exists for potential future use but currently does NOT:
 * - Persist status/view/sort/dir/search to localStorage
 * - Redirect or modify URL params
 * - Override user selections
 * 
 * All defaults are handled server-side in parseInvoicesQuery():
 * - status=all, view=default, sort=issue_date, dir=desc, page=1, pageSize=10, search=""
 * 
 * If persistence is needed in the future, restrict it to pageSize only.
 */
export function InvoicesPreferencesGate({
  workspaceId,
  searchParams,
}: InvoicesPreferencesGateProps) {
  // No-op: Do nothing, let server-side defaults apply
  // This ensures refresh always shows Default View + All status
  return null;
}

