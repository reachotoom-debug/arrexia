import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/auth/server";
import { supabaseServer } from "@/lib/supabase/server";
import { toCsv, formatDate } from "@/lib/csv/exportCsv";

const EXPORT_CHUNK_SIZE = 1000;

type ClientStatusParam = "all" | "active" | "inactive" | "archived";

/**
 * Parse query parameters from export request
 */
function parseExportParams(searchParams: URLSearchParams): {
  workspaceId: string;
  status: ClientStatusParam;
  view: string | null;
  q: string | null;
  sort: string | null;
  dir: "asc" | "desc";
} {
  const workspaceId = searchParams.get("workspaceId") || "";
  const status = (searchParams.get("status") || "active") as ClientStatusParam;
  const view = searchParams.get("view") || null;
  const q = searchParams.get("q") || null;
  const sort = searchParams.get("sort") || null;
  const dir = (searchParams.get("dir") || "asc") as "asc" | "desc";

  return { workspaceId, status, view, q, sort, dir };
}

/**
 * Build base query for clients export (mirrors loadClients logic)
 */
function buildClientsQuery(
  supabase: any,
  workspaceId: string,
  status: ClientStatusParam,
  q: string | null
) {
  let query = supabase
    .from("clients")
    .select("id, name, company, email, whatsapp, whatsapp_phone, status, created_at, updated_at, archived_at, is_active")
    .eq("workspace_id", workspaceId);

  // Apply status/archive filters (same logic as loadClients)
  if (status === "archived") {
    query = query.not("archived_at", "is", null);
  } else {
    query = query.is("archived_at", null);
  }

  if (status === "active") {
    query = query.eq("is_active", true);
  } else if (status === "inactive") {
    query = query.eq("is_active", false);
  }

  // Apply search filter
  if (q) {
    const escapedQ = q.replace(/%/g, "\\%").replace(/_/g, "\\_");
    const searchPattern = `%${escapedQ}%`;
    query = query.or(`name.ilike.${searchPattern},company.ilike.${searchPattern},email.ilike.${searchPattern},whatsapp_phone.ilike.${searchPattern}`);
  }

  return query;
}

/**
 * Fetch all clients in chunks (for large datasets)
 */
async function fetchAllClients(
  supabase: any,
  workspaceId: string,
  status: ClientStatusParam,
  q: string | null
): Promise<any[]> {
  const allClients: any[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    // Build a fresh query builder for each page
    const query = buildClientsQuery(supabase, workspaceId, status, q);
    // Call .range() on the query builder, then await the result
    const { data, error } = await query.range(offset, offset + EXPORT_CHUNK_SIZE - 1);

    if (error) {
      throw error;
    }

    if (data && data.length > 0) {
      allClients.push(...data);
      offset += EXPORT_CHUNK_SIZE;
      hasMore = data.length === EXPORT_CHUNK_SIZE;
    } else {
      hasMore = false;
    }
  }

  return allClients;
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

    // Fetch all clients matching filters
    const clients = await fetchAllClients(supabase, workspaceId, status, q);

    // Prepare CSV headers and rows
    const headers = [
      "ID",
      "Name",
      "Company",
      "Email",
      "WhatsApp",
      "Status",
      "Created At",
      "Archived At",
    ];

    const rows = clients.map((client) => ({
      ID: client.id,
      Name: client.name || "",
      Company: client.company || "",
      Email: client.email || "",
      WhatsApp: client.whatsapp_phone || client.whatsapp || "",
      Status: client.archived_at ? "Archived" : client.is_active ? "Active" : "Inactive",
      "Created At": formatDate(client.created_at),
      "Archived At": formatDate(client.archived_at),
    }));

    // Generate CSV
    const csv = toCsv(headers, rows, {
      dateFields: ["Created At", "Archived At"],
      textFields: ["WhatsApp"], // Preserve phone format, prevent scientific notation
    });

    // Generate filename
    const today = new Date().toISOString().split("T")[0];
    const filename = `FlowCollect_${workspaceId}_clients_${today}.csv`;

    // Return CSV file
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error("[Export Clients] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to export clients" },
      { status: 500 }
    );
  }
}

