import Link from "next/link";
import { PageHeader } from "@/components/layout/PageHeader";
import { ImportClientsSection } from "./_components/ImportClientsSection";
import { ImportInvoicesSection } from "./_components/ImportInvoicesSection";
import { ImportPaymentsSection } from "./_components/ImportPaymentsSection";
import { ImportTabs } from "./_components/ImportTabs";

interface ImportPageProps {
  params: Promise<{ workspaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ImportPage({ params, searchParams }: ImportPageProps) {
  const { workspaceId } = await params;
  const resolvedSearchParams = await searchParams;
  const tabParam = Array.isArray(resolvedSearchParams?.tab)
    ? resolvedSearchParams.tab[0]
    : resolvedSearchParams?.tab;
  const initialTab =
    tabParam === "invoices"
      ? "invoices"
      : tabParam === "payments"
      ? "payments"
      : "clients";

  return (
    <div className="w-full max-w-5xl space-y-8">
      <Link
        href={`/${workspaceId}/settings`}
        className="inline-flex text-sm font-medium text-slate-500 transition-colors hover:text-slate-900"
      >
        ← All settings
      </Link>
      <PageHeader
        title="Import"
        description="Import clients, invoices, and payments from CSV or TSV files."
      />

      <ImportTabs
        initialTab={initialTab}
        clientsContent={<ImportClientsSection workspaceId={workspaceId} />}
        invoicesContent={<ImportInvoicesSection workspaceId={workspaceId} />}
        paymentsContent={<ImportPaymentsSection workspaceId={workspaceId} />}
      />
    </div>
  );
}
