import { requireWorkspace } from "@/lib/auth/server";
import { supabaseServer } from "@/lib/supabase/server";
import {
  CAUGHT_UP_COLLECTIONS_EMPTY,
  FIRST_RUN_COLLECTIONS_EMPTY,
  hasNeverEnteredCollectionsWorkflow,
} from "@/lib/onboarding/workspaceOnboardingState";
import { formatMoney } from "@/lib/utils/format-money";
import Link from "next/link";
import { clsx } from "clsx";
import { ErrorState, EmptyState } from "@/components/ui/state";
import { PaginationBar } from "@/components/PaginationBar";
import { HorizontalScrollArea } from "@/components/table/HorizontalScrollArea";
import { DataTableShell } from "@/components/layout/DataTableShell";
import {
  TABLE_BASE,
  TABLE_CELL_TEXT_COL,
  TABLE_MIN_WIDTH_INNER,
  TABLE_ROW,
  TABLE_TD,
  TABLE_TD_RIGHT,
  TABLE_TH,
  TABLE_TH_RIGHT,
} from "@/components/table/tableShell";
import {
  CommandBar,
  CommandBarControls,
} from "@/components/layout/CommandBar";
import { CommandBarFilters } from "@/components/layout/CommandBarFilters";
import { PageHeader } from "@/components/layout/PageHeader";
import { ResetFiltersButton } from "@/components/shared/reset-filters-button";
import { ExportCsvButton } from "../_components/ExportCsvButton";
import { CollectionsPortfolioActionCell } from "./_components/CollectionsPortfolioActionCell";
import { loadCustomerFacingBusinessName } from "@/lib/branding/loadCustomerFacingBusinessName";
import { resolveClientWhatsAppPhone } from "@/lib/whatsapp/resolveClientWhatsAppPhone";
import { primaryCtaClass } from "@/components/ui/cta-styles";
import {
  COLLECTIONS_ESCALATION_MIN_OVERDUE_DAYS,
  COLLECTIONS_ESCALATION_MIN_OUTSTANDING,
  computePortfolioExposureByCurrency,
  formatPortfolioExposureLabel,
  getOverdueHeatClasses,
  getRiskBadgeClasses,
  getRiskLabel,
  shouldRecommendEscalation,
} from "@/lib/collections/portfolioSummary";
import { formatDateOnlyField } from "@/lib/datetime/formatDateTime";
import { resolveWorkspaceEvaluationDate } from "@/lib/datetime/workspaceCalendar";
import { loadWorkspaceTimeZone } from "@/lib/settings/loadSettings";

const COLLECTIONS_PAGE_SIZE = 10;

type RiskFilter = "high" | "medium" | "low" | "all";

type CollectionsPageProps = {
  params: Promise<{ workspaceId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

// Load collections data from invoices_view (single source of truth)
//
// COLLECTIONS BEHAVIOR:
// - Excludes: archived invoices, void invoices, draft invoices, invoices with outstanding <= 0
// - Excludes invoices for inactive or archived clients (matches Reminders eligibility rules)
// - Shares risk filter logic with Invoices Smart Risk views (risk_level, is_overdue, outstanding > 0)
async function getCollectionsData(
  workspaceId: string,
  risk: RiskFilter,
  page: number,
  pageSize: number
) {
  const supabase = await supabaseServer();

  const [{ count: sentInvoiceCount }, settingsResult, workspaceTimeZone] = await Promise.all([
    supabase
      .from("invoices_view")
      .select("id", { count: "exact", head: true })
      .eq("workspace_id", workspaceId)
      .eq("base_status", "sent")
      .is("archived_at", null),
    supabase
      .from("settings")
      .select("default_currency")
      .eq("workspace_id", workspaceId)
      .maybeSingle(),
    loadWorkspaceTimeZone(workspaceId),
  ]);

  const defaultCurrency = settingsResult.data?.default_currency ?? "USD";
  const evaluationDate = resolveWorkspaceEvaluationDate(new Date(), workspaceTimeZone);

  let baseQuery = supabase
    .from("invoices_view")
    .select(
      `
        id,
        workspace_id,
        client_id,
        client_name,
        client_is_active,
        client_archived_at,
        invoice_number,
        display_status,
        base_status,
        is_overdue,
        overdue_days,
        risk_level,
        outstanding,
        currency,
        issue_date,
        due_date,
        notes
      `,
      { count: "exact" }
    )
    .eq("workspace_id", workspaceId)
    .eq("is_overdue", true)
    .is("archived_at", null)
    .gt("outstanding", 0)
    .eq("client_is_active", true)
    .is("client_archived_at", null);

  if (risk !== "all") {
    baseQuery = baseQuery.eq("risk_level", risk);
  }

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  if (risk === "all") {
    baseQuery = baseQuery
      .order("issue_date", { ascending: false, nullsFirst: false })
      .order("due_date", { ascending: false, nullsFirst: false });
  } else if (risk === "high") {
    baseQuery = baseQuery
      .order("outstanding", { ascending: false, nullsFirst: false })
      .order("overdue_days", { ascending: false, nullsFirst: false });
  } else {
    baseQuery = baseQuery
      .order("overdue_days", { ascending: false, nullsFirst: false })
      .order("outstanding", { ascending: false, nullsFirst: false });
  }
  baseQuery = baseQuery.order("id", { ascending: true });

  const { data: invoiceData, error, count } = await baseQuery.range(from, to);

  if (error) {
    console.error("[Collections] failed to load invoices", { workspaceId, risk, error });
    throw error;
  }

  const invoices = invoiceData ?? [];
  const totalCount = count ?? 0;

  const clientIds = [...new Set(invoices.map((inv) => inv.client_id).filter(Boolean))];
  const clientsMap = new Map<
    string,
    {
      id: string;
      name: string;
      company: string | null;
      email: string | null;
      whatsapp: string | null;
      whatsapp_phone: string | null;
      country: string | null;
    }
  >();

  if (clientIds.length > 0) {
    const { data: clients, error: clientsError } = await supabase
      .from("clients")
      .select("id, name, company, email, whatsapp, whatsapp_phone, country")
      .in("id", clientIds)
      .eq("workspace_id", workspaceId)
      .eq("is_active", true)
      .is("archived_at", null);

    if (clientsError) {
      console.error("[Collections] failed to load clients", { workspaceId, clientsError });
    } else {
      for (const client of clients ?? []) {
        clientsMap.set(client.id, client);
      }
    }
  }

  const enrichedInvoices = invoices.map((inv) => ({
    ...inv,
    client: inv.client_id ? clientsMap.get(inv.client_id) ?? null : null,
  }));

  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  let outstandingByCurrency: Array<{ currency: string; amount: number }> = [];
  try {
    let metricsQuery = supabase
      .from("invoices_view")
      .select("outstanding, currency")
      .eq("workspace_id", workspaceId)
      .eq("is_overdue", true)
      .is("archived_at", null)
      .gt("outstanding", 0)
      .eq("client_is_active", true)
      .is("client_archived_at", null);

    if (risk !== "all") {
      metricsQuery = metricsQuery.eq("risk_level", risk);
    }

    const { data: exposureRows } = await metricsQuery;
    outstandingByCurrency = computePortfolioExposureByCurrency(
      (exposureRows ?? []).map((row) => ({
        outstanding: Number(row.outstanding ?? 0),
        currency: row.currency,
      })),
      defaultCurrency
    );
  } catch (metricsError) {
    console.error("[Collections] failed to calculate outstanding total", { workspaceId, metricsError });
  }

  const exposureLabel = formatPortfolioExposureLabel(outstandingByCurrency);

  return {
    rows: enrichedInvoices,
    count: totalCount,
    page,
    pageSize,
    totalPages,
    evaluationDate,
    summary: {
      invoicesInView: totalCount,
      outstandingByCurrency,
      outstandingLabel: exposureLabel.value,
      outstandingDetail: exposureLabel.detail,
      mode: risk === "all" ? "All risks" : risk === "high" ? "High risk" : risk === "medium" ? "Medium risk" : "Low risk",
      sentInvoiceCount: sentInvoiceCount ?? 0,
    },
  };
}

function SummaryMetric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail?: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums text-slate-900 sm:text-2xl">{value}</p>
      {detail ? <p className="mt-1 text-xs leading-snug text-slate-500">{detail}</p> : null}
    </div>
  );
}

export default async function CollectionsPage({
  params,
  searchParams,
}: CollectionsPageProps) {
  const { workspaceId } = await params;
  await requireWorkspace(workspaceId);

  const resolvedSearchParams = (await searchParams) || {};
  const riskFilter =
    (Array.isArray(resolvedSearchParams.risk)
      ? resolvedSearchParams.risk[0]
      : resolvedSearchParams.risk) ?? "all";

  const risk = (riskFilter === "high" || riskFilter === "medium" || riskFilter === "low" || riskFilter === "all")
    ? (riskFilter as RiskFilter)
    : "all";

  const pageParam = (Array.isArray(resolvedSearchParams.page)
    ? resolvedSearchParams.page[0]
    : resolvedSearchParams.page) ?? "1";
  const page = Math.max(1, parseInt(pageParam, 10) || 1);
  const pageSize = COLLECTIONS_PAGE_SIZE;

  let collectionsData;
  let businessName = "Your company";
  try {
    const supabase = await supabaseServer();
    [collectionsData, businessName] = await Promise.all([
      getCollectionsData(workspaceId, risk, page, pageSize),
      loadCustomerFacingBusinessName(supabase, workspaceId),
    ]);
  } catch {
    return (
      <div className="w-full min-w-0">
        <div className="p-6">
          <ErrorState
            title="Unable to load collections"
            message="We couldn&apos;t load your collections data right now. Please try again in a moment."
          />
        </div>
      </div>
    );
  }

  const { rows: invoices, count, page: currentPage, totalPages, summary, evaluationDate } =
    collectionsData;

  const riskOptions = [
    { id: "high", label: "High risk" },
    { id: "medium", label: "Medium risk" },
    { id: "low", label: "Low risk" },
    { id: "all", label: "All risks" },
  ];

  const buildRiskUrl = (riskId: string) => {
    const params = new URLSearchParams();
    params.set("risk", riskId);
    params.set("page", "1");
    return `/${workspaceId}/collections?${params.toString()}`;
  };

  const collectionsFilterSummary =
    risk !== "all"
      ? riskOptions.find((r) => r.id === risk)?.label ?? risk
      : undefined;
  const activeFilterCount = Number(risk !== "all");

  return (
    <div className="w-full min-w-0 space-y-4 md:space-y-6">
      <CommandBar>
        <PageHeader
          title="Collections"
          description="Monitor overdue exposure and prioritize the accounts that need attention."
          secondaryActions={
            <Link
              href={`/${workspaceId}/actions`}
              className="inline-flex items-center rounded-md border border-blue-200 bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
            >
              Open Today&apos;s Action Center →
            </Link>
          }
          primaryAction={
            <Link href={`/${workspaceId}/invoices/new`} className={primaryCtaClass}>
              New Invoice
            </Link>
          }
          headerTrailing={
            <ExportCsvButton workspaceId={workspaceId} module="invoices" />
          }
        />
        <CommandBarControls
          filters={
            <CommandBarFilters
              summary={collectionsFilterSummary}
              activeCount={activeFilterCount}
              clearAllHref={`/${workspaceId}/collections`}
            >
              <div className="flex flex-wrap gap-2">
                {riskOptions.map((r) => {
                  const isActive = risk === r.id;
                  return (
                    <Link
                      key={r.id}
                      href={buildRiskUrl(r.id)}
                      className={
                        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition " +
                        (isActive
                          ? "border-blue-600 bg-blue-100 text-blue-800 shadow-sm ring-1 ring-blue-200"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                      }
                    >
                      {r.label}
                    </Link>
                  );
                })}
              </div>
            </CommandBarFilters>
          }
          filterAdjacentActions={
            <ResetFiltersButton basePath={`/${workspaceId}/collections`} />
          }
        />
      </CommandBar>

      <section aria-label="Portfolio summary" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryMetric
          label="Overdue invoices"
          value={String(summary.invoicesInView)}
          detail={
            summary.invoicesInView === 1
              ? "Invoice in this portfolio view"
              : "Invoices in this portfolio view"
          }
        />
        <SummaryMetric
          label="Overdue exposure"
          value={summary.outstandingLabel}
          detail={summary.outstandingDetail}
        />
        <SummaryMetric
          label="Risk segment"
          value={summary.mode}
          detail={risk !== "all" ? "Filtered portfolio segment" : "All overdue risk levels"}
        />
      </section>

      {count === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
          {(() => {
            const neverHadReceivables = hasNeverEnteredCollectionsWorkflow({
              invoiceCount: summary.sentInvoiceCount,
              sentInvoiceCount: summary.sentInvoiceCount,
            });
            const emptyCopy: {
              title: string;
              message: string;
              actionLabel?: string;
              actionHref?: string;
            } =
              risk === "all" && neverHadReceivables
                ? FIRST_RUN_COLLECTIONS_EMPTY
                : {
                    title:
                      risk === "low"
                        ? "No low risk overdue invoices"
                        : risk === "medium"
                        ? "No medium risk overdue invoices"
                        : risk === "high"
                        ? "No high risk overdue invoices"
                        : CAUGHT_UP_COLLECTIONS_EMPTY.title,
                    message:
                      risk === "low"
                        ? "No low risk invoices found. Try selecting a different risk level."
                        : risk === "medium"
                        ? "No medium risk invoices found. Try selecting a different risk level."
                        : risk === "high"
                        ? "No high risk invoices found. Try selecting a different risk level."
                        : CAUGHT_UP_COLLECTIONS_EMPTY.message,
                    actionLabel:
                      risk === "all" && !neverHadReceivables
                        ? CAUGHT_UP_COLLECTIONS_EMPTY.actionLabel
                        : neverHadReceivables
                        ? FIRST_RUN_COLLECTIONS_EMPTY.actionLabel
                        : undefined,
                    actionHref:
                      risk === "all"
                        ? neverHadReceivables
                          ? `/${workspaceId}/invoices/new`
                          : `/${workspaceId}/invoices`
                        : undefined,
                  };

            return (
              <EmptyState
                title={emptyCopy.title}
                message={emptyCopy.message}
                actionLabel={emptyCopy.actionLabel}
                actionHref={emptyCopy.actionHref}
              />
            );
          })()}
        </div>
      ) : (
        <>
          <DataTableShell disableInnerScroll>
            <HorizontalScrollArea
              className="relative w-full min-w-0"
              viewportClassName="overflow-x-auto scrollbar-thin scrollbar-transparent"
            >
              <div className={TABLE_MIN_WIDTH_INNER}>
                <table className={TABLE_BASE}>
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className={`hidden lg:table-cell ${TABLE_TH}`}>Risk</th>
                      <th className={`min-w-[11rem] ${TABLE_TH} text-left`}>Client / Invoice</th>
                      <th className={clsx(TABLE_TH, TABLE_TH_RIGHT, "whitespace-nowrap")}>
                        Outstanding
                      </th>
                      <th className={`hidden md:table-cell ${TABLE_TH} whitespace-nowrap`}>
                        Due / Aging
                      </th>
                      <th className={`hidden xl:table-cell ${TABLE_TH}`}>Escalation</th>
                      <th className={clsx(TABLE_TH, TABLE_TH_RIGHT, "whitespace-nowrap")}>
                        Portfolio action
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoices.map((inv) => {
                      const client = inv.client;
                      const overdueDays = Number(inv.overdue_days ?? 0);
                      const outstanding = Number(inv.outstanding ?? 0);
                      const currency = inv.currency ?? "USD";
                      const escalate = shouldRecommendEscalation(overdueDays, outstanding);

                      return (
                        <tr key={inv.id} className={TABLE_ROW}>
                          <td className={`hidden lg:table-cell ${TABLE_TD} text-sm`}>
                            <span
                              className={clsx(
                                "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                                getRiskBadgeClasses(inv.risk_level)
                              )}
                            >
                              {getRiskLabel(inv.risk_level)}
                            </span>
                          </td>

                          <td className={clsx(TABLE_TD, TABLE_CELL_TEXT_COL, "text-sm")}>
                            <div className="flex items-start gap-2">
                              <span
                                className={clsx(
                                  "mt-0.5 inline-flex shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset lg:hidden",
                                  getRiskBadgeClasses(inv.risk_level)
                                )}
                              >
                                {getRiskLabel(inv.risk_level)}
                              </span>
                              <div className="min-w-0">
                                <div className="font-medium text-slate-900 break-words">
                                  {inv.client_name || "—"}
                                </div>
                                <Link
                                  href={`/${workspaceId}/invoices/${inv.id}`}
                                  className="mt-0.5 inline-block text-sm font-medium text-blue-600 hover:underline"
                                >
                                  {inv.invoice_number || `INV-${String(inv.id).slice(0, 8)}`}
                                </Link>
                                {client?.email?.trim() ? (
                                  <div className="mt-0.5 hidden break-words text-xs text-slate-500 md:block">
                                    {client.email.trim()}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                          </td>

                          <td
                            className={clsx(
                              TABLE_TD,
                              TABLE_TD_RIGHT,
                              "text-sm font-semibold tabular-nums text-slate-900 whitespace-nowrap"
                            )}
                          >
                            {formatMoney(outstanding, currency)}
                          </td>

                          <td
                            className={clsx(
                              "hidden md:table-cell",
                              TABLE_TD,
                              "text-sm text-slate-700 whitespace-nowrap"
                            )}
                          >
                            <div>{formatDateOnlyField(inv.due_date)}</div>
                            {overdueDays > 0 ? (
                              <span
                                className={clsx(
                                  "mt-1 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset tabular-nums",
                                  getOverdueHeatClasses(overdueDays)
                                )}
                              >
                                {overdueDays} day{overdueDays === 1 ? "" : "s"}
                              </span>
                            ) : (
                              <div className="mt-1 text-xs text-slate-400">—</div>
                            )}
                          </td>

                          <td className={`hidden xl:table-cell ${TABLE_TD} text-sm`}>
                            {escalate ? (
                              <span
                                title={`Escalate when overdue ≥ ${COLLECTIONS_ESCALATION_MIN_OVERDUE_DAYS} days and outstanding ≥ ${COLLECTIONS_ESCALATION_MIN_OUTSTANDING}`}
                                className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 ring-1 ring-inset ring-red-200"
                              >
                                Escalate
                              </span>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>

                          <td className={clsx(TABLE_TD, TABLE_TD_RIGHT, "py-2.5 text-sm min-w-0")}>
                            <CollectionsPortfolioActionCell
                              workspaceId={workspaceId}
                              invoiceId={inv.id}
                              invoiceNumber={inv.invoice_number ?? null}
                              clientName={inv.client_name ?? null}
                              clientPhone={resolveClientWhatsAppPhone(
                                client?.whatsapp_phone,
                                client?.whatsapp
                              )}
                              clientCountry={client?.country ?? null}
                              businessName={businessName}
                              outstanding={outstanding}
                              currency={currency}
                              dueDate={inv.due_date ?? null}
                              daysOverdue={overdueDays}
                              evaluationDate={evaluationDate}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </HorizontalScrollArea>
          </DataTableShell>

          <div className="border-t border-slate-100 px-4 pt-3 pb-1 sm:px-5">
            <PaginationBar
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={count}
              itemLabel={`invoice${count !== 1 ? "s" : ""}`}
              basePath={`/${workspaceId}/collections`}
              queryParams={{ ...resolvedSearchParams, risk }}
            />
          </div>
        </>
      )}
    </div>
  );
}
