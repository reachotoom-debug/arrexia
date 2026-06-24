import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/server";
import { supabaseServer } from "@/lib/supabase/server";
import { toCsv, formatDate, formatMoney } from "@/lib/csv/exportCsv";

const EXPORT_CHUNK_SIZE = 1000;

type PaymentStatusParam = "all" | "completed" | "pending" | "failed" | "refunded" | "archived";

/**
 * Parse query parameters from export request
 */
function parseExportParams(searchParams: URLSearchParams): {
  workspaceId: string;
  status: PaymentStatusParam;
  view: string | null;
  q: string | null;
  sort: string | null;
  dir: "asc" | "desc";
} {
  const workspaceId = searchParams.get("workspaceId") || "";
  const status = (searchParams.get("status") || "all") as PaymentStatusParam;
  const view = searchParams.get("view") || null;
  const q = searchParams.get("q") || null;
  const sort = searchParams.get("sort") || null;
  const dir = (searchParams.get("dir") || "desc") as "asc" | "desc";

  return { workspaceId, status, view, q, sort, dir };
}

/**
 * Build base query for payments export (mirrors loadPayments logic)
 */
function buildPaymentsQuery(
  supabase: any,
  workspaceId: string,
  status: PaymentStatusParam,
  q: string | null
) {
  const isArchivedFilter = status === "archived";

  let query;
  if (isArchivedFilter) {
    // Archived: query base payments table
    query = supabase
      .from("payments")
      .select(
        "id, workspace_id, invoice_id, payment_date, amount, currency, method, status, transaction_id, notes, payment_provider, created_at, updated_at, archived_at, invoices(invoice_number, client_id, clients(name))"
      )
      .eq("workspace_id", workspaceId)
      .not("archived_at", "is", null);
  } else {
    // Active: query payments_view
    query = supabase
      .from("payments_view")
      .select(
        "id, workspace_id, invoice_id, payment_date, amount, currency, method, status, transaction_id, notes, payment_provider, created_at, updated_at, archived_at, invoice_number, client_name, is_failed, paid_at"
      )
      .eq("workspace_id", workspaceId);

    // Apply status filter (only for non-archived)
    if (status !== "all") {
      const validActiveStatuses: PaymentStatusParam[] = ["completed", "pending", "failed", "refunded"];
      if (validActiveStatuses.includes(status)) {
        query = query.eq("status", status);
      }
    }
  }

  // Apply search filter
  if (q) {
    const escapedQ = q.replace(/%/g, "\\%").replace(/_/g, "\\_");
    const searchPattern = `%${escapedQ}%`;

    if (isArchivedFilter) {
      // Archived: search transaction_id, notes
      query = query.or(`transaction_id.ilike.${searchPattern},notes.ilike.${searchPattern}`);
    } else {
      // Active: search client_name, invoice_number, transaction_id, notes
      query = query.or(`client_name.ilike.${searchPattern},invoice_number.ilike.${searchPattern},transaction_id.ilike.${searchPattern},notes.ilike.${searchPattern}`);
    }
  }

  return query;
}

/**
 * Fetch all payments in chunks
 */
async function fetchAllPayments(
  supabase: any,
  workspaceId: string,
  status: PaymentStatusParam,
  q: string | null
): Promise<any[]> {
  const allPayments: any[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    // Build a fresh query builder for each page
    const query = buildPaymentsQuery(supabase, workspaceId, status, q);
    // Call .range() on the query builder, then await the result
    const { data, error } = await query.range(offset, offset + EXPORT_CHUNK_SIZE - 1);

    if (error) {
      throw error;
    }

    if (data && data.length > 0) {
      allPayments.push(...data);
      offset += EXPORT_CHUNK_SIZE;
      hasMore = data.length === EXPORT_CHUNK_SIZE;
    } else {
      hasMore = false;
    }
  }

  return allPayments;
}

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams;
    const { workspaceId, status, q } = parseExportParams(searchParams);

    if (!workspaceId) {
      return NextResponse.json({ error: "workspaceId is required" }, { status: 400 });
    }

    // Verify workspace access
    await requireWorkspace(workspaceId);

    const supabase = await supabaseServer();

    // Fetch all payments matching filters
    const payments = await fetchAllPayments(supabase, workspaceId, status, q);

    // Prepare CSV headers and rows
    const headers = [
      "Payment Date",
      "Amount",
      "Currency",
      "Method",
      "Provider",
      "Status",
      "Invoice Number",
      "Client Name",
      "Transaction ID",
      "Created At",
      "Archived At",
    ];

    const rows = payments.map((payment) => {
      const isArchived = status === "archived";

      // Extract invoice/client info differently for archived vs active
      const invoiceNumber = isArchived
        ? (payment.invoices as any)?.invoice_number || ""
        : payment.invoice_number || "";

      const clientName = isArchived
        ? (payment.invoices as any)?.clients?.name || ""
        : payment.client_name || "";

      const currency = payment.currency || "USD";
      const amount = Number(payment.amount ?? 0);

      return {
        "Payment Date": formatDate(payment.payment_date || payment.paid_at),
        Amount: formatMoney(amount, currency),
        Currency: currency,
        Method: payment.method || "",
        Provider: payment.payment_provider || "",
        Status: payment.status || "",
        "Invoice Number": invoiceNumber,
        "Client Name": clientName,
        "Transaction ID": payment.transaction_id || "",
        "Created At": formatDate(payment.created_at),
        "Archived At": formatDate(payment.archived_at),
      };
    });

    // Generate CSV
    const csv = toCsv(headers, rows, {
      dateFields: ["Payment Date", "Created At", "Archived At"],
      moneyFields: ["Amount"],
    });

    // Generate filename
    const today = new Date().toISOString().split("T")[0];
    const filename = `FlowCollect_${workspaceId}_payments_${today}.csv`;

    // Return CSV file
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[Export Payments] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export payments" },
      { status: 500 }
    );
  }
}

