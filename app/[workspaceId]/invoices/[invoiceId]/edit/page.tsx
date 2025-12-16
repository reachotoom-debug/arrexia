import { notFound, redirect } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/server";
import { supabaseServer } from "@/lib/supabase/server";
import { InvoiceForm } from "../../_components/InvoiceForm";
import { type InvoiceFormValues } from "@/lib/invoices/schema";
import { updateInvoice } from "../../actions";

interface EditInvoicePageProps {
  params: Promise<{ workspaceId: string; invoiceId: string }>;
}

export default async function EditInvoicePage({ params }: EditInvoicePageProps) {
  const { workspaceId, invoiceId } = await params;
  await requireWorkspace(workspaceId);
  const supabase = await supabaseServer();

  // Fetch invoice - include payment terms, derived fields, and money fields
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select("id, client_id, invoice_number, issue_date, due_date, po_number, notes, status, currency, payment_terms, payment_terms_days, payment_state, amount, total_paid, discount_percent, tax_percent")
    .eq("id", invoiceId)
    .single();

  // Check if invoice is paid using payment_state
  const isPaid = invoice?.payment_state === "paid";
  
  // Use derived total_paid from database
  const totalPaid = Number(invoice?.total_paid ?? 0);
  const invoiceTotal = Number(invoice?.amount ?? 0);
  
  const isFullyPaid = totalPaid >= invoiceTotal && invoiceTotal > 0;

  if (invoiceError || !invoice) {
    notFound();
  }

  // Fetch invoice items
  const { data: invoiceItems, error: itemsError } = await supabase
    .from("invoice_items")
    .select("id, name, description, quantity, unit_price, position")
    .eq("invoice_id", invoiceId)
    .order("position", { ascending: true, nullsFirst: false });

  if (itemsError) {
    return (
      <div className="rounded-xl bg-red-50 p-4 text-red-800">
        Error loading invoice items: {itemsError.message}
      </div>
    );
  }

  // Fetch clients
  const { data: clients, error: clientsError } = await supabase
    .from("clients")
    .select("id, name")
    .eq("workspace_id", workspaceId)
    .eq("status", "active")
    .order("name", { ascending: true });

  if (clientsError) {
    return (
      <div className="rounded-xl bg-red-50 p-4 text-red-800">
        Error loading clients: {clientsError.message}
      </div>
    );
  }

  // Format dates to YYYY-MM-DD
  const formatDate = (date: string | Date) => {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  // Map DB result into InvoiceFormValues shape
  const initialData: InvoiceFormValues = {
    clientId: invoice.client_id,
    invoiceNumber: invoice.invoice_number,
    issueDate: formatDate(invoice.issue_date),
    dueDate: formatDate(invoice.due_date),
    poNumber: invoice.po_number ?? "",
    notes: invoice.notes ?? "",
    status: (invoice.status === "void" ? "void" : invoice.status === "sent" ? "sent" : "draft") as "draft" | "sent" | "void",
    paymentTerms: (invoice.payment_terms as "net_7" | "net_15" | "net_30" | "net_45" | "net_60" | "due_on_receipt" | "custom") ?? "net_30",
    paymentTermsDays: invoice.payment_terms_days ?? undefined,
    discountPercent: Number(invoice.discount_percent ?? 0), // Load from database
    taxPercent: Number(invoice.tax_percent ?? 0), // Load from database
    items: (invoiceItems || []).map((item, index) => ({
      id: item.id,
      name: item.name,
      description: item.description ?? "",
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      position: item.position ?? index + 1,
    })),
  };

  async function handleUpdate(values: InvoiceFormValues) {
    "use server";
    const result = await updateInvoice(workspaceId, invoiceId, values);
    if (result && "error" in result) {
      throw new Error(result.error);
    }
    redirect(`/${workspaceId}/invoices/${invoiceId}`);
  }

  return (
    <div className="max-w-5xl mx-auto py-6">
      {isFullyPaid && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">This invoice is fully paid.</p>
          <p className="mt-1 text-xs">
            Line items and totals are locked. You can only edit notes and status.
          </p>
        </div>
      )}
      <InvoiceForm
        mode="edit"
        initialData={initialData}
        clients={clients || []}
        onSubmit={handleUpdate}
        workspaceId={workspaceId}
        cancelUrl={`/${workspaceId}/invoices/${invoiceId}`}
        isPaid={isFullyPaid}
      />
    </div>
  );
}
