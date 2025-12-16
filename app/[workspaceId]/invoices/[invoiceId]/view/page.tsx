import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/server";
import { supabaseServer } from "@/lib/supabase/server";
import Link from "next/link";
import ActionMenu from "@/components/clients/action-menu";
import { getPaymentTermsLabel } from "@/lib/utils/payment-terms";
import DeleteInvoiceModal from "@/components/invoices/delete-invoice-modal";
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
    .select("*, clients(*)")
    .eq("id", invoiceId)
    .eq("workspace_id", workspaceId)
    .single();

  if (invoiceError || !invoice) {
    notFound();
  }

  // Fetch invoice items
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

  return (
    <ViewInvoiceClient
      invoice={invoice}
      items={items || []}
      subtotal={subtotal}
      workspaceId={workspaceId}
      invoiceId={invoiceId}
    />
  );
}

