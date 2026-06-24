import { supabaseAdmin } from "@/lib/supabase/admin";

export type AdminAuditInput = {
  actorUserId: string | null;
  action: string;
  targetType?: string | null;
  targetId?: string | null;
  metadata?: Record<string, unknown>;
};

export async function logAdminAuditEvent(input: AdminAuditInput): Promise<void> {
  try {
    const admin = supabaseAdmin();
    const { error } = await admin.from("admin_audit_logs").insert({
      actor_user_id: input.actorUserId,
      action: input.action,
      target_type: input.targetType ?? null,
      target_id: input.targetId ?? null,
      metadata: input.metadata ?? {},
    });

    if (error) {
      console.error("[adminAudit] Failed to insert audit log:", error.message);
    }
  } catch (error) {
    console.error("[adminAudit] Unexpected audit log error:", error);
  }
}
