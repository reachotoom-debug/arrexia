import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/server";
import { supabaseServer } from "@/lib/supabase/server";
import ViewInvoiceClient from "@/components/invoices/view-invoice-client";

interface ViewInvoicePageProps {
  params: Promise<{ workspaceId: string; invoiceId: string }>;
}

export default async function ViewInvoicePage({ params }: ViewInvoicePageProps) {
  const { workspaceId, invoiceId } = await params;
  await requireWorkspace(workspaceId);
  const supabase = await supabaseServer();

  // Fetch invoice with client details
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, invoice_number, issue_date, due_date, currency, notes, status, clients(id, name, email, company)")
    .eq("id", invoiceId)
    .eq("workspace_id", workspaceId)
    .single();

  if (invoiceError || !invoice) {
    notFound();
  }

  // Fetch invoice items
  // NOTE: invoice_items has no workspace_id; scope via invoices join (already verified invoice belongs to workspace)
  const { data: items, error: itemsError } = await supabase
    .from("invoice_items")
    .select("*")
    .eq("invoice_id", invoiceId)
    .order("created_at", { ascending: true });

  if (itemsError) {
    return (
      <div className="rounded-xl bg-red-50 p-4 text-red-800">
        Error loading invoice items: {itemsError.message}
      </div>
    );
  }

  const subtotal = items?.reduce((sum, item) => sum + (item.line_total || 0), 0) || 0;

  // Transform Supabase result to match ViewInvoiceClient's expected Invoice type
  const invoiceForView: Parameters<typeof ViewInvoiceClient>[0]["invoice"] = {
    id: invoice.id,
    invoice_number: invoice.invoice_number,
    issue_date: invoice.issue_date,
    due_date: invoice.due_date,
    status: invoice.status,
    currency: invoice.currency || "USD",
    notes: invoice.notes,
    clients: Array.isArray(invoice.clients) 
      ? invoice.clients[0] || null
      : invoice.clients,
  };

  return (
    <ViewInvoiceClient
      invoice={invoiceForView}
      items={items || []}
      subtotal={subtotal}
      workspaceId={workspaceId}
      invoiceId={invoiceId}
    />
  );
}

