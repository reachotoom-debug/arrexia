import { supabaseServer } from "@/lib/supabase/server";
import { requireWorkspace } from "@/lib/auth/server";

export type HealthCheckResult = {
  name: string;
  status: "PASS" | "FAIL" | "WARN";
  details: string;
  sql: string;
  rowsPreview: any[];
};

export async function runHealthChecks(workspaceId: string): Promise<HealthCheckResult[]> {
  // Ensure workspace access before running checks
  await requireWorkspace(workspaceId);
  const supabase = await supabaseServer();
  const results: HealthCheckResult[] = [];

  // Check a) NULL workspace_id counts for clients/invoices/payments must be 0
  try {
    // Check for NULL workspace_id in this workspace (rows that should have workspace_id but don't)
    // We check rows that are related to this workspace but have NULL workspace_id
    const [clientsNull, invoicesNull, paymentsNull] = await Promise.all([
      supabase.from("clients").select("id", { count: "exact", head: true }).is("workspace_id", null),
      supabase.from("invoices").select("id", { count: "exact", head: true }).is("workspace_id", null),
      supabase.from("payments").select("id", { count: "exact", head: true }).is("workspace_id", null),
    ]);

    const clientsCount = clientsNull.count ?? 0;
    const invoicesCount = invoicesNull.count ?? 0;
    const paymentsCount = paymentsNull.count ?? 0;
    const totalNull = clientsCount + invoicesCount + paymentsCount;

    results.push({
      name: "NULL workspace_id counts",
      status: totalNull === 0 ? "PASS" : "FAIL",
      details: totalNull === 0 
        ? "All rows have workspace_id" 
        : `Clients: ${clientsCount}, Invoices: ${invoicesCount}, Payments: ${paymentsCount}`,
      sql: `SELECT 
  (SELECT COUNT(*) FROM clients WHERE workspace_id IS NULL) AS clients_null,
  (SELECT COUNT(*) FROM invoices WHERE workspace_id IS NULL) AS invoices_null,
  (SELECT COUNT(*) FROM payments WHERE workspace_id IS NULL) AS payments_null;`,
      rowsPreview: [{ clients_null: clientsCount, invoices_null: invoicesCount, payments_null: paymentsCount }],
    });
  } catch (error) {
    results.push({
      name: "NULL workspace_id counts",
      status: "FAIL",
      details: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      sql: `SELECT 
  (SELECT COUNT(*) FROM clients WHERE workspace_id IS NULL) AS clients_null,
  (SELECT COUNT(*) FROM invoices WHERE workspace_id IS NULL) AS invoices_null,
  (SELECT COUNT(*) FROM payments WHERE workspace_id IS NULL) AS payments_null;`,
      rowsPreview: [],
    });
  }

  // Check b) archived invoices must not appear in invoices_view
  try {
    const { data: archivedInView, error } = await supabase
      .from("invoices_view")
      .select("id")
      .eq("workspace_id", workspaceId);

    if (error) throw error;

    if (archivedInView && archivedInView.length > 0) {
      const invoiceIds = archivedInView.map((iv) => iv.id);
      const { data: archivedInvoices, error: archivedError } = await supabase
        .from("invoices")
        .select("id")
        .in("id", invoiceIds)
        .not("archived_at", "is", null)
        .eq("workspace_id", workspaceId);

      if (archivedError) throw archivedError;

      const count = archivedInvoices?.length ?? 0;
      const previewRows = archivedInvoices?.slice(0, 10).map(inv => ({ id: inv.id })) || [];
      results.push({
        name: "Archived invoices excluded from invoices_view",
        status: count === 0 ? "PASS" : "FAIL",
        details: count === 0 ? "No archived invoices in view" : `${count} archived invoice(s) found in view`,
        sql: `SELECT iv.id 
FROM invoices_view iv
WHERE iv.workspace_id = '${workspaceId}'
  AND EXISTS (
    SELECT 1 FROM invoices i 
    WHERE i.id = iv.id 
      AND i.workspace_id = '${workspaceId}' 
      AND i.archived_at IS NOT NULL
  )
LIMIT 10;`,
        rowsPreview: previewRows,
      });
    } else {
      results.push({
        name: "Archived invoices excluded from invoices_view",
        status: "PASS",
        details: "No invoices in view to check",
        sql: `SELECT iv.id 
FROM invoices_view iv
WHERE iv.workspace_id = '${workspaceId}'
  AND EXISTS (
    SELECT 1 FROM invoices i 
    WHERE i.id = iv.id 
      AND i.workspace_id = '${workspaceId}' 
      AND i.archived_at IS NOT NULL
  )
LIMIT 10;`,
        rowsPreview: [],
      });
    }
  } catch (error) {
    results.push({
      name: "Archived invoices excluded from invoices_view",
      status: "FAIL",
      details: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      sql: `SELECT iv.id 
FROM invoices_view iv
WHERE iv.workspace_id = '${workspaceId}'
  AND EXISTS (
    SELECT 1 FROM invoices i 
    WHERE i.id = iv.id 
      AND i.workspace_id = '${workspaceId}' 
      AND i.archived_at IS NOT NULL
  )
LIMIT 10;`,
      rowsPreview: [],
    });
  }

  // Check c) invoices_view row count must equal invoices where archived_at is null
  try {
    const [viewCount, tableCount] = await Promise.all([
      supabase.from("invoices_view").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId),
      supabase.from("invoices").select("id", { count: "exact", head: true }).eq("workspace_id", workspaceId).is("archived_at", null),
    ]);

    const view = viewCount.count ?? 0;
    const table = tableCount.count ?? 0;
    const diff = Math.abs(view - table);

    results.push({
      name: "invoices_view count matches active invoices",
      status: diff === 0 ? "PASS" : "FAIL",
      details: diff === 0 
        ? `Both have ${view} rows` 
        : `View: ${view}, Table: ${table}, Difference: ${diff}`,
      sql: `SELECT 
  (SELECT COUNT(*) FROM invoices_view WHERE workspace_id = '${workspaceId}') AS view_count,
  (SELECT COUNT(*) FROM invoices WHERE workspace_id = '${workspaceId}' AND archived_at IS NULL) AS table_count;`,
      rowsPreview: [{ view_count: view, table_count: table, difference: diff }],
    });
  } catch (error) {
    results.push({
      name: "invoices_view count matches active invoices",
      status: "FAIL",
      details: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      sql: `SELECT 
  (SELECT COUNT(*) FROM invoices_view WHERE workspace_id = '${workspaceId}') AS view_count,
  (SELECT COUNT(*) FROM invoices WHERE workspace_id = '${workspaceId}' AND archived_at IS NULL) AS table_count;`,
      rowsPreview: [],
    });
  }

  // Check d) outstanding >= 0 for all invoices_view
  try {
    const { data: negativeOutstanding, error } = await supabase
      .from("invoices_view")
      .select("id, invoice_number, outstanding")
      .eq("workspace_id", workspaceId)
      .lt("outstanding", 0)
      .limit(10);

    if (error) throw error;

    const count = negativeOutstanding?.length ?? 0;
    const previewRows = negativeOutstanding?.slice(0, 10) || [];
    results.push({
      name: "outstanding >= 0 for all invoices",
      status: count === 0 ? "PASS" : "FAIL",
      details: count === 0 
        ? "All invoices have outstanding >= 0" 
        : `${count} invoice(s) with negative outstanding`,
      sql: `SELECT id, invoice_number, outstanding 
FROM invoices_view 
WHERE workspace_id = '${workspaceId}' 
  AND outstanding < 0 
LIMIT 10;`,
      rowsPreview: previewRows,
    });
  } catch (error) {
    results.push({
      name: "outstanding >= 0 for all invoices",
      status: "FAIL",
      details: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      sql: `SELECT id, invoice_number, outstanding 
FROM invoices_view 
WHERE workspace_id = '${workspaceId}' 
  AND outstanding < 0 
LIMIT 10;`,
      rowsPreview: [],
    });
  }

  // Check e) paid >= 0 for all invoices_view
  try {
    const { data: negativePaid, error } = await supabase
      .from("invoices_view")
      .select("id, invoice_number, paid")
      .eq("workspace_id", workspaceId)
      .lt("paid", 0)
      .limit(10);

    if (error) throw error;

    const count = negativePaid?.length ?? 0;
    const previewRows = negativePaid?.slice(0, 10) || [];
    results.push({
      name: "paid >= 0 for all invoices",
      status: count === 0 ? "PASS" : "FAIL",
      details: count === 0 
        ? "All invoices have paid >= 0" 
        : `${count} invoice(s) with negative paid`,
      sql: `SELECT id, invoice_number, paid 
FROM invoices_view 
WHERE workspace_id = '${workspaceId}' 
  AND paid < 0 
LIMIT 10;`,
      rowsPreview: previewRows,
    });
  } catch (error) {
    results.push({
      name: "paid >= 0 for all invoices",
      status: "FAIL",
      details: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      sql: `SELECT id, invoice_number, paid 
FROM invoices_view 
WHERE workspace_id = '${workspaceId}' 
  AND paid < 0 
LIMIT 10;`,
      rowsPreview: [],
    });
  }

  // Check f) paid <= total + 0.01 for all invoices_view
  try {
    const { data: allInvoices, error } = await supabase
      .from("invoices_view")
      .select("id, invoice_number, paid, total")
      .eq("workspace_id", workspaceId);

    if (error) throw error;

    const overpaid = allInvoices?.filter((inv) => {
      const paid = inv.paid ?? 0;
      const total = inv.total ?? 0;
      return paid > total + 0.01;
    }) ?? [];

    const count = overpaid.length;
    const previewRows = overpaid.slice(0, 10);
    results.push({
      name: "paid <= total + 0.01 for all invoices",
      status: count === 0 ? "PASS" : "FAIL",
      details: count === 0 
        ? "All invoices have paid <= total + 0.01" 
        : `${count} invoice(s) with paid > total + 0.01`,
      sql: `SELECT id, invoice_number, paid, total 
FROM invoices_view 
WHERE workspace_id = '${workspaceId}' 
  AND paid > total + 0.01 
LIMIT 10;`,
      rowsPreview: previewRows,
    });
  } catch (error) {
    results.push({
      name: "paid <= total + 0.01 for all invoices",
      status: "FAIL",
      details: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      sql: `SELECT id, invoice_number, paid, total 
FROM invoices_view 
WHERE workspace_id = '${workspaceId}' 
  AND paid > total + 0.01 
LIMIT 10;`,
      rowsPreview: [],
    });
  }

  // Check g) display_status='paid' implies outstanding <= 0.01
  try {
    const { data: paidWithOutstanding, error } = await supabase
      .from("invoices_view")
      .select("id, invoice_number, outstanding, display_status")
      .eq("workspace_id", workspaceId)
      .eq("display_status", "paid")
      .gt("outstanding", 0.01)
      .limit(10);

    if (error) throw error;

    const count = paidWithOutstanding?.length ?? 0;
    const previewRows = paidWithOutstanding?.slice(0, 10) || [];
    results.push({
      name: "display_status='paid' implies outstanding <= 0.01",
      status: count === 0 ? "PASS" : "FAIL",
      details: count === 0 
        ? "All paid invoices have outstanding <= 0.01" 
        : `${count} paid invoice(s) with outstanding > 0.01`,
      sql: `SELECT id, invoice_number, outstanding, display_status 
FROM invoices_view 
WHERE workspace_id = '${workspaceId}' 
  AND display_status = 'paid' 
  AND outstanding > 0.01 
LIMIT 10;`,
      rowsPreview: previewRows,
    });
  } catch (error) {
    results.push({
      name: "display_status='paid' implies outstanding <= 0.01",
      status: "FAIL",
      details: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      sql: `SELECT id, invoice_number, outstanding, display_status 
FROM invoices_view 
WHERE workspace_id = '${workspaceId}' 
  AND display_status = 'paid' 
  AND outstanding > 0.01 
LIMIT 10;`,
      rowsPreview: [],
    });
  }

  // Check h) base_status='draft' implies display_status='draft' and is_overdue=false and risk_level is null
  try {
    const { data: draftViolations, error } = await supabase
      .from("invoices_view")
      .select("id, invoice_number, base_status, display_status, is_overdue, risk_level")
      .eq("workspace_id", workspaceId)
      .eq("base_status", "draft");

    if (error) throw error;

    const violations: string[] = [];
    draftViolations?.forEach((inv) => {
      if (inv.display_status !== "draft") violations.push(`Invoice ${inv.invoice_number}: display_status is '${inv.display_status}', expected 'draft'`);
      if (inv.is_overdue) violations.push(`Invoice ${inv.invoice_number}: is_overdue is true, expected false`);
      if (inv.risk_level !== null) violations.push(`Invoice ${inv.invoice_number}: risk_level is '${inv.risk_level}', expected null`);
    });

    const previewRows = draftViolations?.slice(0, 10) || [];
    results.push({
      name: "base_status='draft' implies correct display_status/is_overdue/risk_level",
      status: violations.length === 0 ? "PASS" : "FAIL",
      details: violations.length === 0 
        ? `All ${draftViolations?.length ?? 0} draft invoices are correct` 
        : `${violations.length} violation(s): ${violations.slice(0, 3).join("; ")}${violations.length > 3 ? "..." : ""}`,
      sql: `SELECT id, invoice_number, base_status, display_status, is_overdue, risk_level 
FROM invoices_view 
WHERE workspace_id = '${workspaceId}' 
  AND base_status = 'draft'
LIMIT 10;`,
      rowsPreview: previewRows,
    });
  } catch (error) {
    results.push({
      name: "base_status='draft' implies correct display_status/is_overdue/risk_level",
      status: "FAIL",
      details: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      sql: `SELECT id, invoice_number, base_status, display_status, is_overdue, risk_level 
FROM invoices_view 
WHERE workspace_id = '${workspaceId}' 
  AND base_status = 'draft'
LIMIT 10;`,
      rowsPreview: [],
    });
  }

  // Check i) display_status='overdue' implies base_status='sent' and due_date < current_date and outstanding > 0.01
  try {
    const { data: overdueInvoices, error } = await supabase
      .from("invoices_view")
      .select("id, invoice_number, base_status, display_status, due_date, outstanding")
      .eq("workspace_id", workspaceId)
      .eq("display_status", "overdue");

    if (error) throw error;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split("T")[0];

    const violations: string[] = [];
    overdueInvoices?.forEach((inv) => {
      if (inv.base_status !== "sent") violations.push(`Invoice ${inv.invoice_number}: base_status is '${inv.base_status}', expected 'sent'`);
      if (inv.due_date && inv.due_date >= todayStr) violations.push(`Invoice ${inv.invoice_number}: due_date is ${inv.due_date}, expected < ${todayStr}`);
      if (inv.outstanding <= 0.01) violations.push(`Invoice ${inv.invoice_number}: outstanding is ${inv.outstanding.toFixed(2)}, expected > 0.01`);
    });

    const previewRows = overdueInvoices?.slice(0, 10) || [];
    results.push({
      name: "display_status='overdue' implies correct base_status/due_date/outstanding",
      status: violations.length === 0 ? "PASS" : "FAIL",
      details: violations.length === 0 
        ? `All ${overdueInvoices?.length ?? 0} overdue invoices are correct` 
        : `${violations.length} violation(s): ${violations.slice(0, 3).join("; ")}${violations.length > 3 ? "..." : ""}`,
      sql: `SELECT id, invoice_number, base_status, display_status, due_date, outstanding 
FROM invoices_view 
WHERE workspace_id = '${workspaceId}' 
  AND display_status = 'overdue'
LIMIT 10;`,
      rowsPreview: previewRows,
    });
  } catch (error) {
    results.push({
      name: "display_status='overdue' implies correct base_status/due_date/outstanding",
      status: "FAIL",
      details: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      sql: `SELECT id, invoice_number, base_status, display_status, due_date, outstanding 
FROM invoices_view 
WHERE workspace_id = '${workspaceId}' 
  AND display_status = 'overdue'
LIMIT 10;`,
      rowsPreview: [],
    });
  }

  // Check j) archived payments must not contribute to paid
  try {
    // Find invoices with archived payments
    const { data: archivedPayments, error: paymentsError } = await supabase
      .from("payments")
      .select("invoice_id, net_amount, amount")
      .eq("workspace_id", workspaceId)
      .not("archived_at", "is", null)
      .in("status", [null, "completed", "paid"]);

    if (paymentsError) throw paymentsError;

    if (archivedPayments && archivedPayments.length > 0) {
      // Group by invoice_id and sum
      const invoiceSums = new Map<string, number>();
      archivedPayments.forEach((p) => {
        if (p.invoice_id) {
          const amount = p.net_amount ?? p.amount ?? 0;
          invoiceSums.set(p.invoice_id, (invoiceSums.get(p.invoice_id) ?? 0) + amount);
        }
      });

      // Get top 20 invoice_ids with archived sums > 0
      const topInvoices = Array.from(invoiceSums.entries())
        .filter(([_, sum]) => sum > 0)
        .sort(([_, a], [__, b]) => b - a)
        .slice(0, 20)
        .map(([id]) => id);

      if (topInvoices.length > 0) {
        // Fetch invoices_view.paid for those invoice_ids
        const { data: invoicesView, error: viewError } = await supabase
          .from("invoices_view")
          .select("id, invoice_number, paid, total")
          .eq("workspace_id", workspaceId)
          .in("id", topInvoices);

        if (viewError) throw viewError;

        // Check if paid includes archived payments
        // For each invoice, check if paid > 0 when only archived payments exist
        // Or check if paid matches active payments only
        const { data: activePayments, error: activeError } = await supabase
          .from("payments")
          .select("invoice_id, net_amount, amount")
          .eq("workspace_id", workspaceId)
          .is("archived_at", null)
          .in("status", [null, "completed", "paid"])
          .in("invoice_id", topInvoices);

        if (activeError) throw activeError;

        const activeSums = new Map<string, number>();
        activePayments?.forEach((p) => {
          if (p.invoice_id) {
            const amount = p.net_amount ?? p.amount ?? 0;
            activeSums.set(p.invoice_id, (activeSums.get(p.invoice_id) ?? 0) + amount);
          }
        });

        const warnings: string[] = [];
        invoicesView?.forEach((iv) => {
          const archivedSum = invoiceSums.get(iv.id) ?? 0;
          const activeSum = activeSums.get(iv.id) ?? 0;
          const expectedPaid = activeSum;
          const actualPaid = iv.paid ?? 0;

          // If there are archived payments but no active payments, paid should be 0
          if (archivedSum > 0 && activeSum === 0 && actualPaid > 0.01) {
            warnings.push(`Invoice ${iv.invoice_number}: paid=${actualPaid.toFixed(2)} but only archived payments exist (sum=${archivedSum.toFixed(2)})`);
          }
          // If paid doesn't match active payments (within tolerance)
          else if (Math.abs(actualPaid - expectedPaid) > 0.01) {
            warnings.push(`Invoice ${iv.invoice_number}: paid=${actualPaid.toFixed(2)} vs active payments=${expectedPaid.toFixed(2)} (diff=${Math.abs(actualPaid - expectedPaid).toFixed(2)})`);
          }
        });

        const previewRows = invoicesView?.slice(0, 10) || [];
        results.push({
          name: "Archived payments excluded from paid calculation",
          status: warnings.length === 0 ? "PASS" : "WARN",
          details: warnings.length === 0 
            ? `Checked ${topInvoices.length} invoices with archived payments, all correct` 
            : `${warnings.length} warning(s): ${warnings.slice(0, 2).join("; ")}${warnings.length > 2 ? "..." : ""}`,
          sql: `-- Check for invoices with archived payments contributing to paid
SELECT p.invoice_id, SUM(COALESCE(p.net_amount, p.amount, 0)) AS archived_sum
FROM payments p
WHERE p.workspace_id = '${workspaceId}'
  AND p.archived_at IS NOT NULL
  AND p.status IN (NULL, 'completed', 'paid')
GROUP BY p.invoice_id
HAVING SUM(COALESCE(p.net_amount, p.amount, 0)) > 0
LIMIT 20;`,
          rowsPreview: previewRows,
        });
      } else {
        results.push({
          name: "Archived payments excluded from paid calculation",
          status: "PASS",
          details: "No invoices with archived payments found",
          sql: `-- Check for invoices with archived payments contributing to paid
SELECT p.invoice_id, SUM(COALESCE(p.net_amount, p.amount, 0)) AS archived_sum
FROM payments p
WHERE p.workspace_id = '${workspaceId}'
  AND p.archived_at IS NOT NULL
  AND p.status IN (NULL, 'completed', 'paid')
GROUP BY p.invoice_id
HAVING SUM(COALESCE(p.net_amount, p.amount, 0)) > 0
LIMIT 20;`,
          rowsPreview: [],
        });
      }
    } else {
      results.push({
        name: "Archived payments excluded from paid calculation",
        status: "PASS",
        details: "No archived payments found",
        sql: `-- Check for invoices with archived payments contributing to paid
SELECT p.invoice_id, SUM(COALESCE(p.net_amount, p.amount, 0)) AS archived_sum
FROM payments p
WHERE p.workspace_id = '${workspaceId}'
  AND p.archived_at IS NOT NULL
  AND p.status IN (NULL, 'completed', 'paid')
GROUP BY p.invoice_id
HAVING SUM(COALESCE(p.net_amount, p.amount, 0)) > 0
LIMIT 20;`,
        rowsPreview: [],
      });
    }
  } catch (error) {
    results.push({
      name: "Archived payments excluded from paid calculation",
      status: "WARN",
      details: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      sql: `-- Check for invoices with archived payments contributing to paid
SELECT p.invoice_id, SUM(COALESCE(p.net_amount, p.amount, 0)) AS archived_sum
FROM payments p
WHERE p.workspace_id = '${workspaceId}'
  AND p.archived_at IS NOT NULL
  AND p.status IN (NULL, 'completed', 'paid')
GROUP BY p.invoice_id
HAVING SUM(COALESCE(p.net_amount, p.amount, 0)) > 0
LIMIT 20;`,
      rowsPreview: [],
    });
  }

  // Check k) invoice_items orphan check: invoice_items without matching invoice (via LEFT JOIN)
  // NOTE: invoice_items has no workspace_id; scope via invoices join
  try {
    // Fetch invoice_items and check if their invoice_ids exist in invoices table
    // We check globally (not just workspace) since orphan items are items without ANY invoice
    const { data: allItems } = await supabase
      .from("invoice_items")
      .select("id, invoice_id, name")
      .limit(1000); // Reasonable limit for orphan check

    if (allItems && allItems.length > 0) {
      const invoiceIds = [...new Set(allItems.map(item => item.invoice_id).filter(Boolean))];
      
      if (invoiceIds.length > 0) {
        // Check which invoice_ids don't exist in invoices table (globally)
        const { data: existingInvoices } = await supabase
          .from("invoices")
          .select("id")
          .in("id", invoiceIds);

        const existingInvoiceIds = new Set((existingInvoices || []).map(inv => inv.id));
        const orphanItemsList = allItems.filter(item => item.invoice_id && !existingInvoiceIds.has(item.invoice_id));
        
        const count = orphanItemsList.length;
        const previewRows = orphanItemsList.slice(0, 10).map(item => ({
          id: item.id,
          invoice_id: item.invoice_id,
          name: item.name,
        }));

        results.push({
          name: "invoice_items orphan check (no matching invoice)",
          status: count === 0 ? "PASS" : "FAIL",
          details: count === 0 
            ? "All invoice_items have matching invoices" 
            : `${count} invoice_item(s) without matching invoice`,
          sql: `-- invoice_items has no workspace_id; scope via invoices join
SELECT ii.id, ii.invoice_id, ii.name
FROM invoice_items ii
LEFT JOIN invoices i ON i.id = ii.invoice_id
WHERE i.id IS NULL
LIMIT 10;`,
          rowsPreview: previewRows,
        });
      } else {
        results.push({
          name: "invoice_items orphan check (no matching invoice)",
          status: "PASS",
          details: "No invoice_items found to check",
          sql: `-- invoice_items has no workspace_id; scope via invoices join
SELECT ii.id, ii.invoice_id, ii.name
FROM invoice_items ii
LEFT JOIN invoices i ON i.id = ii.invoice_id
WHERE i.id IS NULL
LIMIT 10;`,
          rowsPreview: [],
        });
      }
    } else {
      results.push({
        name: "invoice_items orphan check (no matching invoice)",
        status: "PASS",
        details: "No invoice_items found to check",
        sql: `-- invoice_items has no workspace_id; scope via invoices join
SELECT ii.id, ii.invoice_id, ii.name
FROM invoice_items ii
LEFT JOIN invoices i ON i.id = ii.invoice_id
WHERE i.id IS NULL
LIMIT 10;`,
        rowsPreview: [],
      });
    }
  } catch (error) {
    results.push({
      name: "invoice_items orphan check (no matching invoice)",
      status: "FAIL",
      details: `Error: ${error instanceof Error ? error.message : "Unknown error"}`,
      sql: `-- invoice_items has no workspace_id; scope via invoices join
SELECT ii.id, ii.invoice_id, ii.name
FROM invoice_items ii
LEFT JOIN invoices i ON i.id = ii.invoice_id
WHERE i.id IS NULL
LIMIT 10;`,
      rowsPreview: [],
    });
  }

  return results;
}

