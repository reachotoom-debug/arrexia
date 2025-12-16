import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

export interface PrintableInvoice {
  id: string;
  invoiceNumber: string;
  issueDate: string;
  dueDate: string;
  clientName: string;
  clientEmail?: string | null;
  clientCompany?: string | null;
  currency: string;
  items: {
    name: string;
    description?: string | null;
    quantity: number;
    unit_price: number;
  }[];
  notes?: string | null;
  workspaceName?: string;
  workspaceEmail?: string | null;
  workspacePhone?: string | null;
  workspaceAddress?: string | null;
  // Money fields from database (source of truth - do NOT recalculate)
  subtotal: number;
  discountPercent: number;
  discountAmount: number;
  taxPercent: number;
  taxAmount: number;
  total: number;
}

export async function generateInvoicePdf(
  invoice: PrintableInvoice
): Promise<Buffer> {
  // Create a new PDF document
  const pdfDoc = await PDFDocument.create();

  // Add a page (A4 size)
  const page = pdfDoc.addPage([595, 842]); // A4 dimensions in points

  // Get fonts
  const helveticaFont = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBoldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Helper function to format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: invoice.currency || "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  // Helper function to format date
  const formatDate = (dateString: string) => {
    try {
      const date = new Date(dateString);
      return date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return dateString;
    }
  };

  let yPosition = 800; // Start from top

  // Title
  page.drawText("Invoice", {
    x: 50,
    y: yPosition,
    size: 24,
    font: helveticaBoldFont,
    color: rgb(0, 0, 0),
  });

  yPosition -= 30;

  // Invoice number
  page.drawText(`Invoice #: ${invoice.invoiceNumber}`, {
    x: 50,
    y: yPosition,
    size: 12,
    font: helveticaFont,
    color: rgb(0.2, 0.2, 0.2),
  });

  yPosition -= 40;

  // From section
  page.drawText("From:", {
    x: 50,
    y: yPosition,
    size: 10,
    font: helveticaBoldFont,
    color: rgb(0, 0, 0),
  });
  yPosition -= 15;
  page.drawText(invoice.workspaceName || "FlowCollect", {
    x: 50,
    y: yPosition,
    size: 10,
    font: helveticaFont,
    color: rgb(0, 0, 0),
  });
  if (invoice.workspaceEmail) {
    yPosition -= 15;
    page.drawText(invoice.workspaceEmail, {
      x: 50,
      y: yPosition,
      size: 9,
      font: helveticaFont,
      color: rgb(0.4, 0.4, 0.4),
    });
  }
  if (invoice.workspacePhone) {
    yPosition -= 15;
    page.drawText(invoice.workspacePhone, {
      x: 50,
      y: yPosition,
      size: 9,
      font: helveticaFont,
      color: rgb(0.4, 0.4, 0.4),
    });
  }
  if (invoice.workspaceAddress) {
    yPosition -= 15;
    page.drawText(invoice.workspaceAddress, {
      x: 50,
      y: yPosition,
      size: 9,
      font: helveticaFont,
      color: rgb(0.4, 0.4, 0.4),
      maxWidth: 250,
    });
  }

  // Billed To section (right side)
  const billedToX = 350;
  let billedToY = yPosition + 15;
  page.drawText("Billed To:", {
    x: billedToX,
    y: billedToY,
    size: 10,
    font: helveticaBoldFont,
    color: rgb(0, 0, 0),
  });
  billedToY -= 15;
  page.drawText(invoice.clientName, {
    x: billedToX,
    y: billedToY,
    size: 10,
    font: helveticaFont,
    color: rgb(0, 0, 0),
  });
  if (invoice.clientCompany) {
    billedToY -= 15;
    page.drawText(invoice.clientCompany, {
      x: billedToX,
      y: billedToY,
      size: 9,
      font: helveticaFont,
      color: rgb(0.2, 0.2, 0.2),
    });
  }
  if (invoice.clientEmail) {
    billedToY -= 15;
    page.drawText(invoice.clientEmail, {
      x: billedToX,
      y: billedToY,
      size: 9,
      font: helveticaFont,
      color: rgb(0.4, 0.4, 0.4),
    });
  }

  yPosition -= 50;

  // Invoice details
  page.drawText(`Issue Date: ${formatDate(invoice.issueDate)}`, {
    x: 50,
    y: yPosition,
    size: 10,
    font: helveticaFont,
    color: rgb(0.2, 0.2, 0.2),
  });
  yPosition -= 15;
  page.drawText(`Due Date: ${formatDate(invoice.dueDate)}`, {
    x: 50,
    y: yPosition,
    size: 10,
    font: helveticaFont,
    color: rgb(0.2, 0.2, 0.2),
  });

  yPosition -= 40;

  // Line items header
  const tableStartY = yPosition;
  page.drawText("Item", {
    x: 50,
    y: yPosition,
    size: 10,
    font: helveticaBoldFont,
    color: rgb(0, 0, 0),
  });
  page.drawText("Description", {
    x: 200,
    y: yPosition,
    size: 10,
    font: helveticaBoldFont,
    color: rgb(0, 0, 0),
  });
  page.drawText("Qty", {
    x: 350,
    y: yPosition,
    size: 10,
    font: helveticaBoldFont,
    color: rgb(0, 0, 0),
  });
  page.drawText("Unit Price", {
    x: 400,
    y: yPosition,
    size: 10,
    font: helveticaBoldFont,
    color: rgb(0, 0, 0),
  });
  page.drawText("Amount", {
    x: 480,
    y: yPosition,
    size: 10,
    font: helveticaBoldFont,
    color: rgb(0, 0, 0),
  });

  yPosition -= 20;

  // Draw line under header
  page.drawLine({
    start: { x: 50, y: yPosition },
    end: { x: 545, y: yPosition },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });

  yPosition -= 10;

  // Line items
  // Note: We still calculate line amounts for display, but use stored subtotal for totals
  let currentPage = page;
  for (const item of invoice.items) {
    if (yPosition < 100) {
      // Add new page if needed
      currentPage = pdfDoc.addPage([595, 842]);
      yPosition = 800;
    }

    const lineAmount = item.quantity * item.unit_price;

    currentPage.drawText(item.name, {
      x: 50,
      y: yPosition,
      size: 9,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    currentPage.drawText(item.description || "", {
      x: 200,
      y: yPosition,
      size: 9,
      font: helveticaFont,
      color: rgb(0.4, 0.4, 0.4),
      maxWidth: 140,
    });
    currentPage.drawText(item.quantity.toString(), {
      x: 350,
      y: yPosition,
      size: 9,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    currentPage.drawText(formatCurrency(item.unit_price), {
      x: 400,
      y: yPosition,
      size: 9,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    currentPage.drawText(formatCurrency(lineAmount), {
      x: 480,
      y: yPosition,
      size: 9,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });

    yPosition -= 20;
  }

  yPosition -= 20;

  // Totals - use stored values from database (source of truth)
  // Do NOT recalculate - use what's stored for consistency
  const subtotal = invoice.subtotal;
  const discountAmount = invoice.discountAmount;
  const taxAmount = invoice.taxAmount;
  const total = invoice.total;

  // Subtotal
  currentPage.drawText("Subtotal:", {
    x: 400,
    y: yPosition,
    size: 10,
    font: helveticaFont,
    color: rgb(0, 0, 0),
  });
  currentPage.drawText(formatCurrency(subtotal), {
    x: 480,
    y: yPosition,
    size: 10,
    font: helveticaFont,
    color: rgb(0, 0, 0),
  });

  yPosition -= 20;

  // Discount (if any)
  if (invoice.discountPercent > 0) {
    currentPage.drawText(`Discount (${invoice.discountPercent}%):`, {
      x: 400,
      y: yPosition,
      size: 10,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    currentPage.drawText(`-${formatCurrency(discountAmount)}`, {
      x: 480,
      y: yPosition,
      size: 10,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    yPosition -= 20;
  }

  // Tax (if any)
  if (invoice.taxPercent > 0) {
    currentPage.drawText(`Tax (${invoice.taxPercent}%):`, {
      x: 400,
      y: yPosition,
      size: 10,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    currentPage.drawText(formatCurrency(taxAmount), {
      x: 480,
      y: yPosition,
      size: 10,
      font: helveticaFont,
      color: rgb(0, 0, 0),
    });
    yPosition -= 20;
  }

  // Draw line above total
  currentPage.drawLine({
    start: { x: 400, y: yPosition },
    end: { x: 545, y: yPosition },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });

  yPosition -= 15;

  // Total
  currentPage.drawText("Total:", {
    x: 400,
    y: yPosition,
    size: 12,
    font: helveticaBoldFont,
    color: rgb(0, 0, 0),
  });
  currentPage.drawText(formatCurrency(total), {
    x: 480,
    y: yPosition,
    size: 12,
    font: helveticaBoldFont,
    color: rgb(0, 0, 0),
  });

  yPosition -= 40;

  // Notes
  if (invoice.notes) {
    currentPage.drawText("Notes:", {
      x: 50,
      y: yPosition,
      size: 10,
      font: helveticaBoldFont,
      color: rgb(0, 0, 0),
    });
    yPosition -= 15;
    const notesLines = invoice.notes.split("\n");
    for (const line of notesLines) {
      if (yPosition < 50) break;
      currentPage.drawText(line, {
        x: 50,
        y: yPosition,
        size: 9,
        font: helveticaFont,
        color: rgb(0.2, 0.2, 0.2),
        maxWidth: 495,
      });
      yPosition -= 15;
    }
  }

  yPosition -= 30;

  // Thank you message
  currentPage.drawText("Thank you for your business!", {
    x: 50,
    y: yPosition,
    size: 10,
    font: helveticaFont,
    color: rgb(0.4, 0.4, 0.4),
  });

  // Serialize the PDF to bytes
  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}
