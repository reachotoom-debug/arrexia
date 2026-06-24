import Link from "next/link";
import {
  buildPaymentsUrl,
  type PaymentListViewParam,
  type PaymentSortKey,
  type PaymentStatusParam,
} from "../_lib/buildPaymentsUrl";

const SORT_PRESETS: { key: PaymentListViewParam; label: string }[] = [
  { key: "default", label: "Default View" },
  { key: "recent-first", label: "Recent first" },
  { key: "largest-first", label: "Largest first" },
  { key: "failed-first", label: "Failed first" },
];

const STATUS_FILTERS: { key: PaymentStatusParam; label: string }[] = [
  { key: "all", label: "All" },
  { key: "completed", label: "Completed" },
  { key: "pending", label: "Pending" },
  { key: "failed", label: "Failed" },
  { key: "refunded", label: "Refunded" },
  { key: "archived", label: "Archived" },
];

type PaymentsFilterLinksProps = {
  workspaceId: string;
  searchParams: Record<string, string | string[] | undefined>;
  view: PaymentListViewParam;
  status: PaymentStatusParam;
  /** When set, column sort overrides preset highlighting */
  columnSort: PaymentSortKey | null;
};

export function PaymentsFilterLinks({
  workspaceId,
  searchParams,
  view,
  status,
  columnSort,
}: PaymentsFilterLinksProps) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-2 text-sm font-semibold text-gray-700">
          Sort preset
        </p>
        <div className="flex flex-wrap gap-2">
          {SORT_PRESETS.map((preset) => {
            const isActive = view === preset.key && !columnSort;
            return (
              <Link
                key={preset.key}
                href={buildPaymentsUrl(workspaceId, searchParams, {
                  view: preset.key === "default" ? undefined : preset.key,
                  status: "all",
                  sort: null,
                  dir: undefined,
                })}
                className={
                  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition " +
                  (isActive
                    ? "border-blue-600 bg-blue-100 text-blue-800 shadow-sm ring-1 ring-blue-200"
                    : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")
                }
              >
                {preset.label}
              </Link>
            );
          })}
        </div>
      </div>
      <div>
        <p className="mb-2 text-sm font-semibold text-gray-700">
          Status
        </p>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((chip) => (
            <Link
              key={chip.key}
              href={buildPaymentsUrl(workspaceId, searchParams, {
                status: chip.key === "all" ? undefined : chip.key,
              })}
              className={
                "rounded-full border px-3 py-1 text-xs font-medium transition " +
                (status === chip.key
                  ? "border-blue-600 bg-blue-100 text-blue-800 shadow-sm ring-1 ring-blue-200"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50")
              }
            >
              {chip.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}

export const PAYMENTS_SORT_PRESET_LABELS = SORT_PRESETS;
export const PAYMENTS_STATUS_LABELS = STATUS_FILTERS;
