/**
 * Client State Model Utilities
 * 
 * AUTHORITATIVE RULES:
 * - Inactive ≠ Archived
 * - Inactive: clients.is_active = false AND archived_at IS NULL
 * - Archived: clients.archived_at IS NOT NULL
 * - Active: clients.is_active = true AND archived_at IS NULL
 */

export interface ClientRecord {
  archived_at: string | null;
  is_active: boolean;
}

/**
 * Get client state flags from a client record
 * 
 * @param client - Client record with archived_at and is_active fields
 * @returns Object with isArchived, isInactive, and isActive flags
 */
export function getClientState(client: ClientRecord | null | undefined) {
  if (!client) {
    return {
      isArchived: false,
      isInactive: false,
      isActive: false,
    };
  }

  // Archived: archived_at IS NOT NULL
  const isArchived = Boolean(client.archived_at);
  
  // Inactive: is_active = false AND NOT archived
  const isInactive = client.is_active === false && !isArchived;
  
  // Active: is_active = true AND NOT archived
  const isActive = client.is_active === true && !isArchived;

  return {
    isArchived,
    isInactive,
    isActive,
  };
}

/**
 * Resolve client status string from archived_at and is_active fields
 * Priority:
 * 1) archived_at != null => "archived"
 * 2) archived_at == null AND is_active == false => "inactive"
 * 3) archived_at == null AND is_active == true => "active"
 * 
 * @param client - Client record with archived_at and is_active fields
 * @returns "active" | "inactive" | "archived"
 */
export function resolveClientStatus(
  client: ClientRecord | null | undefined
): "active" | "inactive" | "archived" {
  if (!client) {
    return "active";
  }

  // Priority 1: archived_at != null => "archived"
  if (client.archived_at) {
    return "archived";
  }

  // Priority 2: archived_at == null AND is_active == false => "inactive"
  if (client.is_active === false) {
    return "inactive";
  }

  // Priority 3: archived_at == null AND is_active == true => "active"
  return "active";
}
