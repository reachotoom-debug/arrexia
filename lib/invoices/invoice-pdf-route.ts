import { NextResponse } from "next/server";

import { requireWorkspaceForApi } from "@/lib/auth/server";
import { supabaseServer } from "@/lib/supabase/server";
import { hydratePrintableInvoice } from "@/lib/invoices/hydratePrintableInvoice";
import { generateInvoicePdf } from "@/lib/invoices/pdf";

type InvoicePdfClientRow = {
  name: string;
  email: string | null;
  company: string | null;
  country: string | null;
  whatsapp_phone: string | null;
  whatsapp: string | null;
};

export function buildInvoicePdfApiPath(workspaceId: string, invoiceId: string): string {
  return `/api/workspaces/${workspaceId}/invoices/${invoiceId}/pdf`;
}

export async function getInvoicePdfResponse(
  workspaceId: string,
  invoiceId: string
): Promise<NextResponse> {
  const auth = await requireWorkspaceForApi(workspaceId);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status });
  }

  const supabase = await supabaseServer();

  const { data: invoice, error: invoiceError } = await supabase
    .from("invoices")
    .select(
      `
      id,
      client_id,
      invoice_number,
      issue_date,
      due_date,
      status,
      currency,
      notes,
      subtotal,
      discount_percent,
      discount_amount,
      tax_percent,
      tax_amount,
      amount,
      payment_terms,
      payment_terms_days
    `
    )
    .eq("id", invoiceId)
    .eq("workspace_id", workspaceId)
    .single();

  if (invoiceError || !invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }

  const [settingsRes, clientRes, itemsRes, invoiceViewRes, paymentsRes] =
    await Promise.all([
      supabase.from("settings").select("*").eq("workspace_id", workspaceId).maybeSingle(),
      invoice.client_id
        ? supabase
            .from("clients")
            .select("name, email, company, country, whatsapp_phone, whatsapp")
            .eq("id", invoice.client_id)
            .eq("workspace_id", workspaceId)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      supabase
        .from("invoice_items")
        .select("id, name, description, quantity, unit_price, position")
        .eq("invoice_id", invoiceId)
        .order("position", { ascending: true, nullsFirst: false }),
      supabase
        .from("invoices_view")
        .select("display_status, paid, outstanding")
        .eq("id", invoiceId)
        .eq("workspace_id", workspaceId)
        .maybeSingle(),
      supabase
        .from("payments")
        .select("amount, status, archived_at")
        .eq("invoice_id", invoiceId)
        .is("archived_at", null),
    ]);

  if (itemsRes.error) {
    return NextResponse.json({ error: "Failed to load invoice items" }, { status: 500 });
  }

  const clientData = (clientRes.data as InvoicePdfClientRow | null) ?? null;

  const printableInvoice = hydratePrintableInvoice({
    invoice,
    items: (itemsRes.data || []).map((item) => ({
      name: item.name,
      description: item.description,
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
    })),
    settings: settingsRes.data,
    client: clientData,
    displayStatus: invoiceViewRes.data?.display_status || invoice.status,
    invoiceView: invoiceViewRes.data,
    payments: paymentsRes.data ?? [],
  });

  try {
    const pdfBuffer = await generateInvoicePdf(printableInvoice);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return new NextResponse(pdfBuffer as any, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="invoice-${invoice.invoice_number}.pdf"`,
      },
    });
  } catch (error) {
    const err = error as Error | undefined;
    const message = err?.message || "Unknown PDF generation error";
    const stack = err?.stack || null;

    console.error("[invoice-pdf] Failed to generate PDF", {
      workspaceId,
      invoiceId,
      message,
      stack,
    });

    const isDev = process.env.NODE_ENV !== "production";
    return NextResponse.json(
      isDev
        ? {
            error: "Failed to generate PDF",
            invoiceId,
            workspaceId,
            message,
          }
        : { error: "Failed to generate PDF" },
      { status: 500 }
    );
  }
}
