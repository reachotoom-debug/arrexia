/**
 * NOTE: unified smart-risk buckets using invoices_view
 * 
 * Shared helper for calculating smart-risk buckets across Dashboard, Collections, and Invoices.
 * Uses invoices_view which already computes status, risk_level, days_overdue, and is_overdue.
 * Only includes overdue invoices (status = 'Overdue') with risk_level set.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type RiskBucket = "high" | "medium" | "low";

export interface RiskBucketSummary {
  bucket: RiskBucket;
  invoiceCount: number;
  totalOutstanding: number;
}

/**
 * Get smart-risk buckets for a workspace.
 * 
 * Only includes overdue invoices (display_status = 'overdue') with risk_level set.
 * Risk levels from invoices_view (canonical source):
 * - High: overdue_days >= 60 OR outstanding >= 5000
 * - Medium: overdue_days BETWEEN 15 AND 59
 * - Low: overdue_days BETWEEN 1 AND 14
 * 
 * Only calculated for overdue invoices (display_status = 'overdue').
 * Non-overdue (draft, sent, paid, void) => risk_level is NULL.
 * 
 * @param supabase - Supabase client instance
 * @param workspaceId - Workspace ID to filter by
 * @returns Array of risk bucket summaries, or empty array on error
 */
export async function getSmartRiskBucketsForWorkspace(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<RiskBucketSummary[]> {
  try {
    // Query invoices_view - only overdue invoices with risk_level
    // NOTE: Use outstanding field (outstanding_amount was dropped)
    const { data: invoices, error } = await supabase
      .from("invoices_view")
      .select("id, outstanding, risk_level")
      .eq("workspace_id", workspaceId)
      .eq("display_status", "overdue")
      .not("risk_level", "is", null);

    if (error) {
      console.error("[getSmartRiskBucketsForWorkspace] query error:", error);
      return [];
    }

    if (!invoices || invoices.length === 0) {
      return [];
    }

    // Group by risk_level from view
    const buckets: Record<RiskBucket, { count: number; totalOutstanding: number }> = {
      high: { count: 0, totalOutstanding: 0 },
      medium: { count: 0, totalOutstanding: 0 },
      low: { count: 0, totalOutstanding: 0 },
    };

    for (const inv of invoices) {
      const outstanding = Number(inv.outstanding ?? 0);
      const riskLevel = inv.risk_level;

      // Only count high, medium, low
      if (riskLevel === "high" || riskLevel === "medium" || riskLevel === "low") {
        const bucket = buckets[riskLevel as RiskBucket];
        bucket.count += 1;
        bucket.totalOutstanding += outstanding;
      }
    }

    // Convert to array format
    return [
      { bucket: "high", invoiceCount: buckets.high.count, totalOutstanding: buckets.high.totalOutstanding },
      { bucket: "medium", invoiceCount: buckets.medium.count, totalOutstanding: buckets.medium.totalOutstanding },
      { bucket: "low", invoiceCount: buckets.low.count, totalOutstanding: buckets.low.totalOutstanding },
    ];
  } catch (error) {
    console.error("[getSmartRiskBucketsForWorkspace] unexpected error:", error);
    return [];
  }
}

