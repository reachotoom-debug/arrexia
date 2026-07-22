"use client";

/**
 * ClientsPreferencesGate - No-op component (no persistence/redirect logic)
 *
 * Does NOT:
 * - Persist status/view/sort/search to localStorage
 * - Restore filters from localStorage via router.replace
 * - Override user selections on bare /clients navigation
 *
 * Defaults are handled server-side in parseClientsQuery():
 * - status=active, view=default, sort=created_at, dir=desc, page=1, pageSize=10, q=""
 */
interface ClientsPreferencesGateProps {
  workspaceId: string;
  searchParams: Record<string, string | string[] | undefined>;
}

export function ClientsPreferencesGate(_props: ClientsPreferencesGateProps) {
  void _props;
  return null;
}
