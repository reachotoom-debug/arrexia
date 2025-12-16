"use client";

/**
 * PaymentsPreferencesGate - No-op component (no persistence/redirect logic)
 * 
 * This component exists for potential future use but currently does NOT:
 * - Persist status/view/sort/dir/q to localStorage
 * - Redirect or modify URL params
 * - Override user selections
 * 
 * All defaults are handled server-side in parsePaymentsQuery():
 * - status=all, view=default, sort=null, dir=desc, page=1, pageSize=10, q=""
 */
export function PaymentsPreferencesGate({
  workspaceId,
  searchParams,
}: {
  workspaceId: string;
  searchParams: Record<string, string | string[] | undefined>;
}) {
  // No-op: Do nothing, let server-side defaults apply
  // This ensures refresh always shows Default View + All status
  return null;
}

