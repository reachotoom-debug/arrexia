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

  // Get invoices for this client with amount from database
  const { data: invoices, error: invoicesError } = await supabase
    .from("invoices")
    .select("id, invoice_number, issue_date, due_date, status, currency, amount")
    .eq("organization_id", "05d2d292-d95b-44f4-b774-22f10068124f")
    .eq("client_id", clientId)
    .order("issue_date", { ascending: false });

  if (invoicesError) {
    return NextResponse.json(
      { error: invoicesError.message },
      { status: 500 }
    );
  }

  // Use amount from database instead of calculating
  const invoicesWithTotals = invoices?.map((inv) => ({
    ...inv,
    total_amount: Number(inv.amount ?? 0), // Keep total_amount for API compatibility
  })) || [];

  return NextResponse.json({ invoices: invoicesWithTotals });
}

