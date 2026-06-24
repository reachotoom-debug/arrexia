import { notFound } from "next/navigation";
import { requireWorkspace } from "@/lib/auth/server";
import { supabaseServer } from "@/lib/supabase/server";
import { InvoiceForm } from "../../_components/InvoiceForm";
import { type InvoiceFormValues } from "@/lib/invoices/schema";
import { updateInvoice } from "../../actions";

interface EditInvoicePageProps {
  params: Promise<{ workspaceId: string; invoiceId: string }>;
}

const isUuid = (value: string): boolean =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

export default async function EditInvoicePage({ params }: EditInvoicePageProps) {
  const { workspaceId, invoiceId } = await params;

  await requireWorkspace(workspaceId);
  const supabase = await supabaseServer();

  const invoiceSelect = `
    id,
    workspace_id,
    client_id,
    invoice_number,
    issue_date,
    due_date,
    currency,
    status,
    po_number,
    notes,
    payment_terms,
    payment_terms_days,
    amount,
    discount_percent,
    tax_percent,
    archived_at
  `;

  // Match detail page: resolve by UUID or invoice_number from the URL segment.
  let invoiceQuery = supabase
    .from("invoices")
    .select(invoiceSelect)
    .eq("workspace_id", workspaceId);

  if (isUuid(invoiceId)) {
    invoiceQuery = invoiceQuery.eq("id", invoiceId);
  } else {
    invoiceQuery = invoiceQuery.eq("invoice_number", invoiceId);
  }

  const { data: invoice, error: invoiceError } = await invoiceQuery.maybeSingle();

  if (invoiceError) {
    if (process.env.NODE_ENV === "development") {
      console.error("[EditInvoicePage] invoice load error", {
        workspaceId,
        invoiceId,
        error: invoiceError,
      });
    }
    throw new Error("Failed to load invoice");
  }

  if (!invoice) {
    notFound();
  }

  const resolvedInvoiceId = invoice.id;

  // For now, set isFullyPaid to false since we can't easily calculate it without querying payments
  // The priority is to load and edit the core invoice fields without crashing
  const isFullyPaid = false;
  
  // Check if invoice is archived
  const isArchived = invoice?.archived_at !== null;

  // Fetch invoice items and client in parallel
  // NOTE: invoice_items has no workspace_id; scope via invoices join (already verified invoice belongs to workspace)
  const [itemsResult, clientResult] = await Promise.all([
    supabase
      .from("invoice_items")
      .select("id, name, description, quantity, unit_price, position")
      .eq("invoice_id", invoice.id)
      .order("position", { ascending: true, nullsFirst: false }),
    invoice.client_id
      ? supabase
          .from("clients")
          .select("id, name, email, company, country")
          .eq("workspace_id", workspaceId)
          .eq("id", invoice.client_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (itemsResult.error) {
    return (
      <div className="rounded-xl bg-red-50 p-4 text-red-800">
        Error loading invoice items: {itemsResult.error.message}
      </div>
    );
  }

  const invoiceItems = itemsResult.data;
  const client = clientResult.data;

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
    // updateInvoice will redirect on success, so we just call it
    // If it returns an error, it will return { error: string } and we throw
    const result = await updateInvoice(workspaceId, resolvedInvoiceId, values);
    if (result && "error" in result) {
      throw new Error(result.error);
    }
    // If we reach here, there was an error (redirect throws, so we never get here on success)
  }

  return (
    <div className="w-full min-w-0">
      {isArchived && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-medium">Archived invoice (read-only)</p>
        </div>
      )}
      {isFullyPaid && !isArchived && (
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
        clients={[]}
        prefilledClient={client ? { id: client.id, name: client.name, company: client.company ?? null } : null}
        onSubmit={handleUpdate}
        workspaceId={workspaceId}
        cancelUrl={`/${workspaceId}/invoices`}
        isPaid={isFullyPaid}
        isArchived={isArchived}
        currency={invoice.currency || "USD"}
      />
    </div>
  );
}
