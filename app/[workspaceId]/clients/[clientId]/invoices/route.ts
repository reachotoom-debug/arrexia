import { requireWorkspace } from "@/lib/auth/server";
import { supabaseServer } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; clientId: string }> }
) {
  const { workspaceId, clientId } = await params;
  await requireWorkspace(workspaceId);
  const supabase = await supabaseServer();

  // Check if showArchived query param is set
  const searchParams = request.nextUrl.searchParams;
  const showArchived = searchParams.get("showArchived") === "true";

  // Build query - include archived invoices if showArchived is true
  // NOTE: Use invoices_view for outstanding field (outstanding_amount was dropped from invoices table)
  // invoices_view excludes archived invoices by default, so for showArchived=true we need a different approach
  let query = supabase
    .from(showArchived ? "invoices" : "invoices_view")
    .select(
      showArchived
        ? `
      id,
      invoice_number,
      status,
      issue_date,
      due_date,
      currency,
      amount,
      archived_at
    `
        : `
      id,
      invoice_number,
      display_status,
      issue_date,
      due_date,
      currency,
      total,
      paid,
      outstanding,
      display_status as payment_state
    `
    )
    .eq("workspace_id", workspaceId)
    .eq("client_id", clientId);
  
  if (showArchived) {
    query = query.neq("status", "void").order("issue_date", { ascending: false });
  } else {
    query = query.neq("display_status", "void").order("issue_date", { ascending: false });
  }

  const { data: invoices, error: invoicesError } = await query;

  if (invoicesError) {
    return NextResponse.json(
      { error: invoicesError.message },
      { status: 500 }
    );
  }

    // Map invoices to consistent format with outstanding_amount field for UI compatibility (legacy)
  const mappedInvoices = (invoices || []).map((inv: any) => {
    if (showArchived) {
      // For archived invoices from invoices table, we can't get outstanding from view
      // Return with outstanding_amount as null (UI should handle this)
      return {
        ...inv,
        outstanding_amount: null,
        total_paid: null,
        payment_state: null,
      };
    } else {
      // For invoices_view, map outstanding to outstanding_amount
      return {
        ...inv,
        outstanding_amount: Number(inv.outstanding ?? 0),
        total_paid: Number(inv.paid ?? 0),
        amount: Number(inv.total ?? 0),
        status: inv.display_status,
        archived_at: null, // invoices_view excludes archived
      };
    }
  });

  return NextResponse.json({ invoices: mappedInvoices });
}

