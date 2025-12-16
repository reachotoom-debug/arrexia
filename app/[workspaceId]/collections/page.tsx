import { requireUser } from "@/lib/auth/server";
import { requireWorkspace } from "@/lib/auth/server";
import { supabaseServer } from "@/lib/supabase/server";
import { formatMoney } from "@/lib/utils/format-money";
import Link from "next/link";
import { ErrorState, EmptyState } from "@/components/ui/state";

type RiskFilter = "high" | "medium" | "low" | "all";

type CollectionsPageProps = {
  params: Promise<{ workspaceId: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

// Load collections data from invoices_view (single source of truth)
async function getCollectionsData(workspaceId: string, risk: RiskFilter) {
  const supabase = await supabaseServer();

  let query = supabase
    .from("invoices_view")
    .select(
      `
        id,
        workspace_id,
        client_id,
        client_name,
        invoice_number,
        display_status,
        is_overdue,
        overdue_days,
        risk_level,
        outstanding,
        currency,
        issue_date,
        due_date
      `
    )
    .eq("workspace_id", workspaceId)
    .eq("is_overdue", true);

  if (risk !== "all") {
    query = query.eq("risk_level", risk);
  }

  const { data, error } = await query.order("overdue_days", { ascending: false });

  if (error) {
    console.error("[Collections] failed to load invoices", { workspaceId, risk, error });
    throw error;
  }

  const invoices = data ?? [];

  const invoicesInView = invoices.length;
  const outstandingInView = invoices.reduce((sum, inv) => sum + Number(inv.outstanding ?? 0), 0);

  return {
    invoices,
    summary: {
      invoicesInView,
      outstandingInView,
      mode: risk === "all" ? "All Risks" : risk === "high" ? "High Risk" : risk === "medium" ? "Medium Risk" : "Low Risk",
    },
  };
}

export default async function CollectionsPage({
  params,
  searchParams,
}: CollectionsPageProps) {
  const user = await requireUser();
  const resolvedParams = await params;
  const { workspace } = await requireWorkspace(resolvedParams.workspaceId);
  const workspaceId = workspace.id;

  const resolvedSearchParams = (await searchParams) || {};
  const riskFilter =
    (Array.isArray(resolvedSearchParams.risk)
      ? resolvedSearchParams.risk[0]
      : resolvedSearchParams.risk) ?? "all";

  const risk = (riskFilter === "high" || riskFilter === "medium" || riskFilter === "low" || riskFilter === "all")
    ? (riskFilter as RiskFilter)
    : "all";

  let collectionsData;
  try {
    collectionsData = await getCollectionsData(workspaceId, risk);
  } catch (error) {
    return (
      <div className="max-w-7xl mx-auto py-6">
        <div className="p-6">
          <ErrorState
            title="Unable to load collections"
            message="We couldn&apos;t load your collections data right now. Please try again in a moment."
          />
        </div>
      </div>
    );
  }

  const { invoices, summary } = collectionsData;

  const riskOptions = [
    { id: "high", label: "High risk" },
    { id: "medium", label: "Medium risk" },
    { id: "low", label: "Low risk" },
    { id: "all", label: "All risks" },
  ];

  // Helper to build URLs with risk filter
  const buildRiskUrl = (riskId: string) => {
    const params = new URLSearchParams();
    params.set("risk", riskId);
    return `/${workspaceId}/collections?${params.toString()}`;
  };

  return (
    <div className="max-w-7xl mx-auto py-6 px-4 space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">Collections mode</h1>
        <p className="mt-2 text-sm text-slate-500">
          Focused view of high-risk and overdue invoices for follow-up.
        </p>
      </div>

      {/* RISK TABS */}
      <div className="flex flex-wrap gap-2">
        {riskOptions.map((r) => {
          const isActive = risk === r.id;
          return (
            <Link
              key={r.id}
              href={buildRiskUrl(r.id)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors
                ${
                  isActive
                    ? "bg-slate-900 text-white"
                    : "bg-slate-100 text-slate-700 hover:bg-slate-200"
                }`}
            >
              {r.label}
            </Link>
          );
        })}
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Invoices in view</div>
          <div className="text-2xl font-bold mt-1">{summary.invoicesInView}</div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Outstanding in view</div>
          <div className="text-2xl font-bold mt-1">
            {formatMoney(summary.outstandingInView, "USD")}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-500">Mode</div>
          <div className="text-2xl font-bold mt-1 capitalize">
            {summary.mode}
          </div>
        </div>
      </div>

      {/* TABLE */}
      {invoices.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm p-6">
          <EmptyState
            title={
              risk === "low"
                ? "No low risk overdue invoices"
                : risk === "medium"
                ? "No medium risk overdue invoices"
                : risk === "high"
                ? "No high risk overdue invoices"
                : "No overdue invoices"
            }
            message={
              risk === "low"
                ? "No low risk invoices found. Try selecting a different risk level."
                : risk === "medium"
                ? "No medium risk invoices found. Try selecting a different risk level."
                : risk === "high"
                ? "No high risk invoices found. Try selecting a different risk level."
                : "All your invoices are up to date. Great job!"
            }
          />
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Risk</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Invoice #</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Client</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Due date</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Overdue days</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wide text-slate-500">Outstanding</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Status</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Contact</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold
                      ${
                        inv.risk_level === "high"
                          ? "bg-red-100 text-red-700 border border-red-200"
                          : inv.risk_level === "medium"
                          ? "bg-amber-100 text-amber-700 border border-amber-200"
                          : "bg-blue-100 text-blue-700 border border-blue-200"
                      }`}
                    >
                      {inv.risk_level?.toUpperCase().charAt(0) || "—"}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <Link
                      href={`/${workspaceId}/invoices/${inv.id}`}
                      className="text-blue-600 font-medium hover:underline"
                    >
                      {inv.invoice_number || `INV-${String(inv.id).slice(0, 8)}`}
                    </Link>
                  </td>

                  <td className="px-4 py-3 text-slate-900">{inv.client_name || "—"}</td>

                  <td className="px-4 py-3 text-slate-700">
                    {inv.due_date ? new Date(inv.due_date).toLocaleDateString() : "—"}
                  </td>

                  <td className="px-4 py-3 text-slate-700">
                    {inv.overdue_days && inv.overdue_days > 0 ? (
                      <span className="text-red-600 font-medium">{inv.overdue_days}</span>
                    ) : (
                      "—"
                    )}
                  </td>

                  <td className="px-4 py-3 text-right font-semibold text-red-600">
                    {formatMoney(Number(inv.outstanding || 0), "USD")}
                  </td>

                  <td className="px-4 py-3">
                    <span className="inline-flex items-center px-3 py-1 rounded-full bg-red-100 text-red-600 text-xs font-semibold">
                      {inv.display_status === "overdue" ? "Overdue" : inv.display_status || "Sent"}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <span className="text-blue-600 text-sm">
                      {/* Note: client_email may not be in invoices_view, showing placeholder */}
                      —
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <span className="text-blue-600 cursor-pointer text-sm">Add note</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
