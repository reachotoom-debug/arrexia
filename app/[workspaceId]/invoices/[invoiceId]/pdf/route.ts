import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabase/server";
import { generateInvoicePdf, type PrintableInvoice } from "@/lib/invoices/pdf";

interface RouteParams {
  params: Promise<{ workspaceId: string; invoiceId: string }>;
}

export async function GET(req: Request, { params }: RouteParams) {
  const { workspaceId, invoiceId } = await params;
  const supabase = await supabaseServer();

  // Load workspace info
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("name, email, phone, address")
    .eq("id", workspaceId)
    .maybeSingle();

  // Load invoice with all money fields
  // IMPORTANT: Use stored values from database for consistency
  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      `
      id,
      invoice_number,
      issue_date,
      due_date,
      currency,
      notes,
      subtotal,
      discount_percent,
      discount_amount,
      tax_percent,
      tax_amount,
      amount,
      clients (
        id,
        name,
        email,
        company
      )
    `
    )
    .eq("id", invoiceId)
    .single();

  if (invoiceError || !invoice) {
    return NextResponse.json(
      { error: "Invoice not found" },
      { status: 404 }
    );
  }

  // Load invoice items
  const { data: items, error: itemsError } = await supabase
    .from("invoice_items")
    .select("id, name, description, quantity, unit_price, position")
    .eq("invoice_id", invoiceId)
    .order("position", { ascending: true, nullsFirst: false });

  if (itemsError) {
    return NextResponse.json(
      { error: "Failed to load invoice items" },
      { status: 500 }
    );
  }

  // Map to PrintableInvoice with stored money values
  const printableInvoice: PrintableInvoice = {
    id: invoice.id,
    invoiceNumber: invoice.invoice_number,
    issueDate: invoice.issue_date,
    dueDate: invoice.due_date,
    clientName: invoice.clients?.name || "Client",
    clientEmail: invoice.clients?.email || null,
    clientCompany: invoice.clients?.company || null,
    currency: invoice.currency || "USD",
    items: (items || []).map((item) => ({
      name: item.name,
      description: item.description,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
    })),
    notes: invoice.notes || null,
    workspaceName: workspace?.name || "FlowCollect",
    workspaceEmail: workspace?.email || null,
    workspacePhone: workspace?.phone || null,
    workspaceAddress: workspace?.address || null,
    // Money fields from database (source of truth)
    subtotal: Number(invoice.subtotal ?? 0),
    discountPercent: Number(invoice.discount_percent ?? 0),
    discountAmount: Number(invoice.discount_amount ?? 0),
    taxPercent: Number(invoice.tax_percent ?? 0),
    taxAmount: Number(invoice.tax_amount ?? 0),
    total: Number(invoice.amount ?? 0),
  };

  try {
    const pdfBuffer = await generateInvoicePdf(printableInvoice);

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="invoice-${invoice.invoice_number}.pdf"`,
      },
    });
  } catch (error) {
    console.error("Failed to generate PDF:", error);
    return NextResponse.json(
      { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}

