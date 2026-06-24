import { NextResponse } from "next/server";

import { supabaseServer } from "@/lib/supabase/server";

import { generateInvoicePdf } from "@/lib/invoices/pdf";

import { hydratePrintableInvoice } from "@/lib/invoices/hydratePrintableInvoice";



interface RouteParams {

  params: Promise<{ workspaceId: string; invoiceId: string }>;

}



type ClientRow = {

  id: string;

  name: string;

  email: string | null;

  company: string | null;

  country: string | null;

  country_code: string | null;

  whatsapp_phone: string | null;

  whatsapp: string | null;

};



export async function GET(req: Request, { params }: RouteParams) {

  const { workspaceId, invoiceId } = await params;

  const supabase = await supabaseServer();



  const { data: settings } = await supabase

    .from("settings")

    .select("*")

    .eq("workspace_id", workspaceId)

    .maybeSingle();



  const { data: invoice, error: invoiceError } = await supabase

    .from("invoices")

    .select(

      `

      id,

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

      payment_terms_days,

      clients (

        id,

        name,

        email,

        company,

        country,

        country_code,

        whatsapp_phone,

        whatsapp

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



  const [itemsRes, invoiceViewRes, paymentsRes] = await Promise.all([

    supabase

      .from("invoice_items")

      .select("id, name, description, quantity, unit_price, position")

      .eq("invoice_id", invoiceId)

      .order("position", { ascending: true, nullsFirst: false }),

    supabase
      .from("invoices_view")
      .select("display_status, paid, outstanding")
      .eq("id", invoiceId)
      .maybeSingle(),

    supabase

      .from("payments")

      .select("amount, status, archived_at")

      .eq("invoice_id", invoiceId)

      .is("archived_at", null),

  ]);



  if (itemsRes.error) {

    return NextResponse.json(

      { error: "Failed to load invoice items" },

      { status: 500 }

    );

  }



  const clientData = Array.isArray(invoice.clients)

    ? (invoice.clients[0] as ClientRow | undefined)

    : (invoice.clients as ClientRow | null);



  const printableInvoice = hydratePrintableInvoice({

    invoice,

    items: (itemsRes.data || []).map((item) => ({

      name: item.name,

      description: item.description,

      quantity: Number(item.quantity),

      unit_price: Number(item.unit_price),

    })),

    settings,

    client: clientData ?? null,

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


