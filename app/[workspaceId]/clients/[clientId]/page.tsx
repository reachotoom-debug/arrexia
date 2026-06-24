import { notFound } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import Link from "next/link";
import { formatMoney } from "@/lib/invoices/utils";
import { getPaymentTermsLabel } from "@/lib/utils/payment-terms";
import { KPI } from "@/app/[workspaceId]/dashboard/_components/KPI";
import { ArchivedBanner } from "@/components/ui/archived-banner";
import { InactiveBanner } from "@/components/ui/inactive-banner";
import { ToggleClientActive } from "./_components/ToggleClientActive";
import { getClientState, resolveClientStatus } from "@/lib/clients/state";
import { ClientInvoicesTable } from "./_components/ClientInvoicesTable";

interface ClientPageProps {
  params: Promise<{ workspaceId: string; clientId: string }>;
}

export default async function ClientPage({ params }: ClientPageProps) {
  const { workspaceId, clientId } = await params;
  const supabase = await supabaseServer();

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("*")
    .eq("id", clientId)
    .eq("workspace_id", workspaceId)
    .single();

  if (clientError || !client) {
    notFound();
  }

  // Client state model: Active vs Inactive vs Archived
  // Inactive: is_active = false AND archived_at IS NULL
  // Archived: archived_at IS NOT NULL
  // Active: is_active = true AND archived_at IS NULL
  const { isArchived, isInactive, isActive } = getClientState(client);

  // Fetch client invoices - use invoices_view to get paid/outstanding (total_paid/outstanding_amount were dropped)
  // Always exclude archived invoices by default (invoices_view already excludes archived)
  const { data: invoices, error: invoicesError } = await supabase
    .from("invoices_view")
    .select(
      `
      id,
      invoice_number,
      base_status,
      display_status,
      issue_date,
      due_date,
      currency,
      total,
      paid,
      outstanding
    `
    )
    .eq("client_id", clientId)
    .eq("workspace_id", workspaceId)
    .neq("base_status", "void") // Exclude void invoices from client stats
    .order("issue_date", { ascending: false });

  // Log invoice query errors for debugging (dev-only)
  if (invoicesError && process.env.NODE_ENV === "development") {
    console.error("[ClientPage] Failed to load invoices:", {
      code: invoicesError.code,
      message: invoicesError.message,
      details: invoicesError.details,
      hint: invoicesError.hint,
      workspaceId,
      clientId,
    });
  }

  // Use fields from invoices_view (total, paid, outstanding)
  const invoicesWithTotals = (invoices || []).map((invoice) => ({
    ...invoice,
    total: Number(invoice.total ?? 0),
    paid: Number(invoice.paid ?? 0),
    outstanding: Number(invoice.outstanding ?? 0),
    status: invoice.base_status ?? invoice.display_status ?? "sent", // Use base_status or display_status
  }));

  // Calculate metrics - exclude void invoices (ACTIVE invoices only)
  const totalInvoices = invoicesWithTotals.length;
  const totalBilled = invoicesWithTotals.reduce(
    (sum, inv) => sum + inv.total,
    0
  );
  const totalPaid = invoicesWithTotals.reduce((sum, inv) => sum + inv.paid, 0);
  const outstandingBalance = invoicesWithTotals.reduce(
    (sum, inv) => sum + inv.outstanding,
    0
  );

  return (
    <div className="mx-auto w-full max-w-5xl min-w-0 space-y-6">
      {/* Archived Banner */}
      {isArchived && <ArchivedBanner entityType="client" />}
      
      {/* Inactive Banner */}
      {isInactive && !isArchived && <InactiveBanner />}

      {/* Header */}
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">
            {client.name}
          </h1>
          {client.company && (
            <p className="text-sm text-slate-500 mt-1">{client.company}</p>
          )}
          <div className="mt-2 flex items-center gap-2">
            {/* Status badge: derived from archived_at and is_active, not clients.status */}
            {(() => {
              const status = resolveClientStatus(client);
              return (
                <span
                  className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-medium capitalize ${
                    status === "archived"
                      ? "bg-slate-100 text-slate-600 border-slate-300"
                      : status === "active"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-slate-50 text-slate-700 border-slate-200"
                  }`}
                >
                  {status}
                </span>
              );
            })()}
            {!isArchived && (
              <ToggleClientActive
                workspaceId={workspaceId}
                clientId={clientId}
                currentActive={client.is_active}
              />
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Link
            href={`/${workspaceId}/clients/${client.id}/edit?returnTo=${encodeURIComponent(`/${workspaceId}/clients`)}`}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50"
          >
            Edit Client
          </Link>
          {isArchived || isInactive ? (
            <span
              className="inline-flex items-center rounded-lg px-3 py-2 text-xs font-medium shadow-sm bg-slate-300 text-slate-500 cursor-not-allowed"
              aria-disabled={true}
            >
              New Invoice
            </span>
          ) : (
            <Link
              href={`/${workspaceId}/invoices/new?clientId=${client.id}`}
              className="inline-flex items-center rounded-lg px-3 py-2 text-xs font-medium shadow-sm bg-blue-600 text-white hover:bg-blue-700"
            >
              New Invoice
            </Link>
          )}
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <KPI title="Active invoices" value={totalInvoices} />
          <KPI
            title="Active billed"
            value={formatMoney(totalBilled, "USD")}
          />
          <KPI title="Active paid" value={formatMoney(totalPaid, "USD")} />
          <KPI
            title="Active outstanding"
            value={formatMoney(outstandingBalance, "USD")}
          />
        </div>
        <p className="text-xs text-slate-500">
          Archived invoices are hidden by default. Use &apos;Show archived&apos; to view history.
        </p>
      </div>

      {/* Client Info Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-700 mb-4">
          Client Information
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <dt className="text-xs text-slate-500">Email</dt>
            <dd className="text-sm text-slate-900 mt-1">
              {client.email ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Phone / WhatsApp</dt>
            <dd className="text-sm text-slate-900 mt-1">
              {client.whatsapp ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Company</dt>
            <dd className="text-sm text-slate-900 mt-1">
              {client.company ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Country</dt>
            <dd className="text-sm text-slate-900 mt-1">
              {client.country ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Payment Terms</dt>
            <dd className="text-sm text-slate-900 mt-1">
              {getPaymentTermsLabel(client.payment_terms)}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Status</dt>
            <dd className="text-sm text-slate-900 mt-1 capitalize">
              {/* Use client state model: archived, inactive, or active */}
              {isArchived ? "archived" : isActive ? "active" : "inactive"}
            </dd>
          </div>
        </div>
        {client.notes && (
          <div className="mt-4 pt-4 border-t border-slate-200">
            <dt className="text-xs text-slate-500 mb-1">Notes</dt>
            <dd className="text-sm text-slate-700 whitespace-pre-line">
              {client.notes}
            </dd>
          </div>
        )}
      </div>

      {/* Client Invoices */}
      <ClientInvoicesTable
        clientId={clientId}
        workspaceId={workspaceId}
        initialInvoices={invoicesWithTotals.map((inv) => ({
          id: inv.id,
          invoice_number: inv.invoice_number,
          status: inv.base_status ?? inv.display_status ?? "sent",
          issue_date: inv.issue_date,
          due_date: inv.due_date,
          currency: inv.currency || "USD",
          amount: inv.total,
          total_paid: inv.paid,
          outstanding_amount: inv.outstanding,
          payment_state: inv.display_status ?? null,
          archived_at: null, // invoices_view excludes archived invoices
        }))}
        isArchived={isArchived}
        isInactive={isInactive}
      />
    </div>
  );
}
