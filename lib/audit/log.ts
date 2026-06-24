/**
 * Centralized audit logging helper
 * 
 * Provides a single function to log audit events to activity_logs table.
 * All logging is non-blocking - failures are logged but don't crash user flows.
 */

import { supabaseServer } from "@/lib/supabase/server";
import { getWorkspaceOrganizationId } from "@/lib/workspaces/getWorkspaceOrganizationId";

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
  organizationId?: string; // optional override; otherwise resolved from workspace
}

/**
 * Log an audit event to activity_logs table
 * 
 * This function is non-blocking - if logging fails, it logs a warning
 * and returns { ok: false } but does not throw, ensuring core user flows continue to work.
 * 
 * Uses server-side Supabase client (cookie-based auth) for proper RLS context.
 * 
 * @param options - Audit log options
 * @returns { ok: true } on success, { ok: false } on failure (non-blocking)
 */
export async function logAuditEvent(options: LogAuditOptions): Promise<{ ok: boolean }> {
  try {
    const {
      workspaceId,
      userId = null,
      entityType,
      entityId,
      action,
      metadata = {},
      organizationId,
    } = options;

    const resolvedOrganizationId =
      organizationId ?? (await getWorkspaceOrganizationId(workspaceId));

    // Runtime guardrail: workspace_id is required for RLS policies
    if (!workspaceId) {
      console.warn("[AuditLog] Missing workspace_id, skipping audit log", {
        entityType,
        entityId,
        action,
      });
      return { ok: false };
    }

    // Use server-side Supabase client (cookie-based auth) for proper RLS context
    const supabase = await supabaseServer();

    // Insert into activity_logs table
    // Include workspace_id and actor_user_id explicitly for RLS policies
    const { error } = await supabase.from("activity_logs").insert({
      organization_id: resolvedOrganizationId,
      workspace_id: workspaceId, // Required for RLS policy
      actor_user_id: userId, // Use actor_user_id (preferred) or fallback to user_id
      user_id: userId, // Keep for backward compatibility if table still has this column
      entity_type: entityType,
      entity_id: entityId,
      action,
      metadata: metadata as Record<string, unknown>, // Json type from Supabase
    });

    if (error) {
      // RLS or missing session errors should be warnings, not errors
      // This is expected in some scenarios (e.g., cron jobs without user context)
      console.warn("[AuditLog] Failed to insert audit log:", {
        code: error.code,
        message: error.message,
        entityType,
        entityId,
        action,
        workspaceId,
      });
      return { ok: false };
    }

    return { ok: true };
  } catch (error) {
    // Catch any unexpected errors (e.g. network issues, type mismatches)
    console.warn("[AuditLog] Unexpected error during audit logging:", {
      error: error instanceof Error ? error.message : String(error),
      entityType: options.entityType,
      entityId: options.entityId,
      action: options.action,
    });
    // Do not rethrow - audit logging should never break user flows
    return { ok: false };
  }
}
