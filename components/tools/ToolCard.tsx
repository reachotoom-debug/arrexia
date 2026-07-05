import Link from "next/link";
import {
  Calculator,
  CalendarClock,
  ChartColumnIncreasing,
  CircleDollarSign,
  Clock3,
  Percent,
  Scale,
  ShieldAlert,
  Wallet,
} from "lucide-react";
import type { ToolDefinition } from "@/lib/tools/catalog";

const ICONS = {
  calculator: Calculator,
  aging: ChartColumnIncreasing,
  forecast: Wallet,
  risk: ShieldAlert,
  interest: Percent,
  terms: Scale,
  capital: CircleDollarSign,
  "due-date": CalendarClock,
} as const;

type ToolCardProps = {
  tool: ToolDefinition;
};

export function ToolCard({ tool }: ToolCardProps) {
  const Icon = ICONS[tool.icon];
  const isLive = tool.status === "live" && tool.href;

  const content = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <span
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
            isLive
              ? "bg-emerald-50 text-emerald-700"
              : "bg-slate-100 text-slate-600"
          }`}
        >
          {isLive ? "Live" : "Coming Soon"}
        </span>
      </div>
      <h3 className="mt-5 text-lg font-semibold text-slate-900">{tool.title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{tool.description}</p>
      <div className="mt-5 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
          <Clock3 className="h-3.5 w-3.5" aria-hidden="true" />
          {tool.estimatedTime}
        </span>
        {isLive ? (
          <span className="text-sm font-semibold text-blue-600 group-hover:text-blue-700">
            Use Calculator →
          </span>
        ) : null}
      </div>
    </>
  );

  if (isLive && tool.href) {
    return (
      <Link
        href={tool.href}
        className="group flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
        aria-label={`Open ${tool.title}`}
      >
        {content}
      </Link>
    );
  }

  return (
    <article className="flex h-full flex-col rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      {content}
    </article>
  );
}
