/**
 * Centralized audit logging helper
 * 
 * Provides a single function to log audit events to activity_logs table.
 * All logging is non-blocking - failures are logged but don't crash user flows.
 */

import { supabaseServer } from "@/lib/supabase/server";

// Default organization ID used throughout the codebase
// TODO: In the future, map workspace_id to organization_id dynamically
const DEFAULT_ORGANIZATION_ID = "05d2d292-d95b-44f4-b774-22f10068124f";

export type AuditEntityType =
  | "invoice"
  | "payment"
  | "reminder"
  | "invoice_delivery"
  | "workspace"
  | "client";

export type AuditAction =
  | "created"
  | "updated"
  | "deleted"
  | "sent"
  | "status_changed"
  | "settings_updated";

export interface LogAuditOptions {
  workspaceId: string;
  userId?: string | null; // optional, e.g. for cron/auto jobs
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction | string; // allow extension
  metadata?: Record<string, unknown>;
  organizationId?: string; // optional override, defaults to DEFAULT_ORGANIZATION_ID
}

/**
 * Log an audit event to activity_logs table
 * 
 * This function is non-blocking - if logging fails, it logs an error
 * but does not throw, ensuring core user flows continue to work.
 * 
 * @param options - Audit log options
 */
export async function logAuditEvent(options: LogAuditOptions): Promise<void> {
  try {
    const {
      workspaceId,
      userId = null,
      entityType,
      entityId,
      action,
      metadata = {},
      organizationId = DEFAULT_ORGANIZATION_ID,
    } = options;

    const supabase = await supabaseServer();

    // Insert into activity_logs table
    // Include workspace_id and actor_user_id explicitly for RLS policies
    const { error } = await supabase.from("activity_logs").insert({
      organization_id: organizationId,
      workspace_id: workspaceId, // Required for RLS policy
      actor_user_id: userId, // Use actor_user_id (preferred) or fallback to user_id
      user_id: userId, // Keep for backward compatibility if table still has this column
      entity_type: entityType,
      entity_id: entityId,
      action,
      metadata: metadata as Record<string, unknown>, // Json type from Supabase
    });

    if (error) {
      console.error("[AuditLog] Failed to insert audit log:", {
        error: error.message,
        code: error.code,
        entityType,
        entityId,
        action,
        workspaceId,
      });
    }
  } catch (error) {
    // Catch any unexpected errors (e.g. network issues, type mismatches)
    console.error("[AuditLog] Unexpected error during audit logging:", {
      error: error instanceof Error ? error.message : String(error),
      entityType: options.entityType,
      entityId: options.entityId,
      action: options.action,
    });
    // Do not rethrow - audit logging should never break user flows
  }
}
