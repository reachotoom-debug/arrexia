import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicInvoiceView } from "@/components/invoices/PublicInvoiceView";
import { loadPublicInvoiceByToken } from "@/lib/invoices/publicInvoiceLoader";

type PublicInvoicePageProps = {
  params: Promise<{ token: string }>;
};

export async function generateMetadata({
  params,
}: PublicInvoicePageProps): Promise<Metadata> {
  const { token } = await params;
  const result = await loadPublicInvoiceByToken(token);
  if (!result.ok) {
    return { title: "Invoice not found", robots: { index: false, follow: false } };
  }

  return {
    title: `Invoice ${result.invoice.invoiceNumber}`,
    robots: { index: false, follow: false },
  };
}

export default async function PublicInvoicePage({ params }: PublicInvoicePageProps) {
  const { token } = await params;
  const result = await loadPublicInvoiceByToken(token);

  if (!result.ok) {
    notFound();
  }

  return <PublicInvoiceView invoice={result.invoice} />;
}
