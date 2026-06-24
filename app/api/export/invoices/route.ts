import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/server";
import { supabaseServer } from "@/lib/supabase/server";
import { toCsv, formatDate, formatMoney } from "@/lib/csv/exportCsv";

const EXPORT_CHUNK_SIZE = 1000;

type InvoiceStatusParam = "all" | "draft" | "sent" | "paid" | "partial" | "overdue" | "void" | "archived";

/**
 * Parse query parameters from export request
 */
function parseExportParams(searchParams: URLSearchParams): {
  workspaceId: string;
  status: InvoiceStatusParam;
  view: string | null;
  search: string | null;
  sort: string | null;
  dir: "asc" | "desc";
  clientId: string | null;
} {
  const workspaceId = searchParams.get("workspaceId") || "";
  const status = (searchParams.get("status") || "all") as InvoiceStatusParam;
  const view = searchParams.get("view") || null;
  const search = searchParams.get("search") || null;
  const sort = searchParams.get("sort") || null;
  const dir = (searchParams.get("dir") || "desc") as "asc" | "desc";
  const clientId = searchParams.get("clientId") || null;

  return { workspaceId, status, view, search, sort, dir, clientId };
}

/**
 * Normalize display_status to canonical format
 */
function normalizeDisplayStatus(value: string | null | undefined): string {
  if (!value) return "";
  const normalized = value.toLowerCase().replace(/\s+/g, "_");
  return normalized;
}

/**
 * Build base query for invoices export (mirrors loadInvoices logic)
 */
function buildInvoicesQuery(
  supabase: any,
  workspaceId: string,
  status: InvoiceStatusParam,
  search: string | null,
  clientId: string | null
) {
  const isArchivedFilter = status === "archived";

  let query;
  if (isArchivedFilter) {
    // Archived: query base invoices table for identity/meta fields only.
    // Financial/status derived fields must come from invoices_view only.
    query = supabase
      .from("invoices")
      .select(
        "id, workspace_id, client_id, invoice_number, issue_date, due_date, currency, po_number, notes, archived_at, clients(name, email)"
      )
      .eq("workspace_id", workspaceId)
      .not("archived_at", "is", null);
  } else {
    // Active: query invoices_view
    query = supabase
      .from("invoices_view")
      .select(
        "id, workspace_id, client_id, client_name, invoice_number, base_status, issue_date, due_date, currency, total, paid, outstanding, display_status, is_overdue, overdue_days, risk_level, po_number, notes"
      )
      .eq("workspace_id", workspaceId);

    // Apply status filters (only for non-archived)
    if (status === "draft") {
      query = query.eq("base_status", "draft");
    } else if (status === "void") {
      query = query.eq("base_status", "void");
    } else if (status === "paid") {
      query = query.or("display_status.eq.paid,display_status.eq.Paid");
    } else if (status === "partial") {
      query = query.or("display_status.eq.partially_paid,display_status.eq.Partially Paid");
    } else if (status === "overdue") {
      query = query.or("display_status.eq.overdue,display_status.eq.Overdue");
    } else if (status === "sent") {
      query = query.or("display_status.eq.sent,display_status.eq.Sent");
    }
    // status="all" => no status filter
  }

  // Apply clientId filter
  if (clientId) {
    query = query.eq("client_id", clientId);
  }

  // Apply search filter
  if (search) {
    const escapedSearch = search.replace(/%/g, "\\%").replace(/_/g, "\\_");
    const searchPattern = `%${escapedSearch}%`;

    if (isArchivedFilter) {
      // Archived: search invoice_number, po_number, notes
      query = query.or(`invoice_number.ilike.${searchPattern},po_number.ilike.${searchPattern},notes.ilike.${searchPattern}`);
    } else {
      // Active: search invoice_number, po_number, notes, client_name
      query = query.or(`invoice_number.ilike.${searchPattern},po_number.ilike.${searchPattern},notes.ilike.${searchPattern},client_name.ilike.${searchPattern}`);
    }
  }

  return query;
}

/**
 * Fetch all invoices in chunks
 */
async function fetchAllInvoices(
  supabase: any,
  workspaceId: string,
  status: InvoiceStatusParam,
  search: string | null,
  clientId: string | null
): Promise<any[]> {
  const allInvoices: any[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    // Build a fresh query builder for each page
    const query = buildInvoicesQuery(supabase, workspaceId, status, search, clientId);
    // Call .range() on the query builder, then await the result
    const { data, error } = await query.range(offset, offset + EXPORT_CHUNK_SIZE - 1);

    if (error) {
      throw error;
    }

    if (data && data.length > 0) {
      allInvoices.push(...data);
      offset += EXPORT_CHUNK_SIZE;
      hasMore = data.length === EXPORT_CHUNK_SIZE;
    } else {
      hasMore = false;
    }
  }

  return allInvoices;
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const { workspaceId, status, search, clientId } = parseExportParams(searchParams);

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    // Verify workspace access
    await requireWorkspace(workspaceId);

    const supabase = await supabaseServer();

    // Fetch all invoices matching filters
    const invoices = await fetchAllInvoices(supabase, workspaceId, status, search, clientId);

    // Prepare CSV headers and rows
    const headers = [
      "Invoice Number",
      "Client Name",
      "Client Email",
      "Issue Date",
      "Due Date",
      "Status",
      "Total",
      "Paid",
      "Outstanding",
      "Currency",
      "Created At",
      "Archived At",
    ];

    const rows = invoices.map((invoice) => {
      // Handle archived vs active invoices differently
      const isArchived = status === "archived";
      
      const clientName = isArchived
        ? (invoice.clients as any)?.name || ""
        : invoice.client_name || "";
      
      const clientEmail = isArchived
        ? (invoice.clients as any)?.email || ""
        : "";

      const invoiceNumber = invoice.invoice_number || "";
      const currency = invoice.currency || "USD";
      
      // Status display
      const statusDisplay = isArchived
        ? "archived"
        : invoice.display_status || invoice.base_status || "";

      // Financial fields (invoices_view is the only source of truth for paid/outstanding/display logic).
      // Archived exports do not derive these from base invoices rows.
      const total = isArchived ? null : Number(invoice.total ?? 0);
      const paid = isArchived ? null : Number(invoice.paid ?? 0);
      const outstanding = isArchived ? null : Number(invoice.outstanding ?? 0);

      // Get created_at from issue_date if not available
      const createdAt = (invoice as any).created_at || invoice.issue_date;

      return {
        "Invoice Number": invoiceNumber,
        "Client Name": clientName,
        "Client Email": clientEmail,
        "Issue Date": formatDate(invoice.issue_date),
        "Due Date": formatDate(invoice.due_date),
        Status: statusDisplay,
        Total: total === null ? "" : formatMoney(total, currency),
        Paid: paid === null ? "" : formatMoney(paid, currency),
        Outstanding: outstanding === null ? "" : formatMoney(outstanding, currency),
        Currency: currency,
        "Created At": formatDate(createdAt),
        "Archived At": formatDate(invoice.archived_at),
      };
    });

    // Generate CSV
    const csv = toCsv(headers, rows, {
      dateFields: ["Issue Date", "Due Date", "Created At", "Archived At"],
      moneyFields: ["Total", "Paid", "Outstanding"],
    });

    // Generate filename
    const today = new Date().toISOString().split("T")[0];
    const filename = `FlowCollect_${workspaceId}_invoices_${today}.csv`;

    // Return CSV file
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[Export Invoices] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export invoices" },
      { status: 500 }
    );
  }
}

