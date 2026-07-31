import Link from "next/link";
import {
  formatAutomationRuleCountLabel,
  type AutomationStatusPresentation,
} from "@/lib/reminders/remindersCenterPresentation";

type AutomationStatusPanelProps = {
  status: AutomationStatusPresentation;
};

export function AutomationStatusPanel({ status }: AutomationStatusPanelProps) {
  const statusTone =
    status.statusLabel === "Enabled"
      ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
      : status.statusLabel === "Disabled"
        ? "bg-slate-100 text-slate-700 ring-slate-200"
        : "bg-amber-50 text-amber-900 ring-amber-200";

  return (
    <section
      aria-label="Automation status"
      className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm sm:px-5"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Automation Status</h2>
            <span
              className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset ${statusTone}`}
            >
              {status.statusLabel}
            </span>
          </div>
          <div className="space-y-0.5">
            <p className="text-sm text-slate-600">{status.statusDetail}</p>
            {status.statusSecondaryDetail ? (
              <p className="text-sm text-slate-600">{status.statusSecondaryDetail}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset bg-emerald-50 text-emerald-800 ring-emerald-200"
              aria-label={formatAutomationRuleCountLabel(status.activeRules, "active")}
            >
              {formatAutomationRuleCountLabel(status.activeRules, "active")}
            </span>
            <span
              className="inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset bg-slate-100 text-slate-700 ring-slate-200"
              aria-label={formatAutomationRuleCountLabel(status.disabledRules, "disabled")}
            >
              {formatAutomationRuleCountLabel(status.disabledRules, "disabled")}
            </span>
            {status.scheduleLabel ? (
              <span className="text-slate-500">
                Schedule:{" "}
                <span className="font-medium text-slate-700">{status.scheduleLabel}</span>
              </span>
            ) : null}
          </div>
        </div>
        <Link
          href={status.settingsHref}
          className="inline-flex shrink-0 items-center text-sm font-medium text-blue-600 hover:underline"
        >
          Reminder settings
        </Link>
      </div>
    </section>
  );
}
