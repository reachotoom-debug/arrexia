import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Check } from "lucide-react";

type ComparisonRow = {
  label: string;
  starter: string;
  pro: string;
  business: string;
  highlight?: boolean;
};

const COMPARISON_ROWS: ComparisonRow[] = [
  {
    label: "Price",
    starter: "$39/mo or $32/mo billed annually ($390/yr)",
    pro: "$89/mo or $74/mo billed annually ($890/yr)",
    business: "Coming soon",
    highlight: true,
  },
  {
    label: "Free trial",
    starter: "✓ 14 days",
    pro: "✓ 14 days",
    business: "Coming soon",
  },
  {
    label: "Active clients",
    starter: "Up to 25",
    pro: "Up to 250",
    business: "Higher limits",
  },
  {
    label: "Invoices per month",
    starter: "Up to 50",
    pro: "Up to 500",
    business: "Higher limits",
  },
  {
    label: "Workspace members",
    starter: "1",
    pro: "Up to 3",
    business: "Team permissions",
  },
  { label: "Client management", starter: "✓", pro: "✓", business: "✓" },
  { label: "Invoice management", starter: "✓", pro: "✓", business: "✓" },
  { label: "Branded PDF invoices", starter: "✓", pro: "✓", business: "✓" },
  { label: "Manual payment tracking", starter: "✓", pro: "✓", business: "✓" },
  { label: "Basic dashboard", starter: "✓", pro: "✓", business: "✓" },
  { label: "Basic risk score", starter: "✓", pro: "✓", business: "✓" },
  { label: "Manual reminders", starter: "✓", pro: "✓", business: "✓" },
  { label: "Reminder history", starter: "✓", pro: "✓", business: "✓" },
  { label: "Export data", starter: "✓", pro: "✓", business: "✓" },
  { label: "Automated reminder rules", starter: "—", pro: "✓", business: "✓" },
  { label: "Suggested reminders", starter: "—", pro: "✓", business: "✓" },
  { label: "Collection workflows", starter: "—", pro: "✓", business: "✓" },
  { label: "Advanced risk analysis", starter: "—", pro: "✓", business: "✓" },
  { label: "Collections dashboard", starter: "—", pro: "✓", business: "✓" },
  { label: "Email templates", starter: "—", pro: "✓", business: "✓" },
  { label: "CSV import/export", starter: "—", pro: "✓", business: "✓" },
  { label: "Priority support", starter: "—", pro: "✓", business: "✓" },
  { label: "Custom domain", starter: "—", pro: "—", business: "✓" },
  { label: "API access", starter: "—", pro: "—", business: "✓" },
];

function CellContent({ value, emphasized }: { value: string; emphasized?: boolean }) {
  if (value === "✓") {
    return (
      <Check
        className="mx-auto h-[18px] w-[18px] text-emerald-600"
        strokeWidth={2.5}
        aria-label="Included"
      />
    );
  }

  if (value === "—") {
    return (
      <span className="text-base font-light text-slate-300" aria-label="Not included">
        —
      </span>
    );
  }

  if (value.startsWith("✓ ")) {
    const detail = value.slice(2);
    return (
      <span className="inline-flex items-center justify-center gap-1.5">
        <Check className="h-[18px] w-[18px] shrink-0 text-emerald-600" strokeWidth={2.5} />
        <span className={emphasized ? "font-semibold text-slate-900" : "text-slate-700"}>
          {detail}
        </span>
      </span>
    );
  }

  return (
    <span className={emphasized ? "font-semibold text-slate-900" : "text-slate-700"}>
      {value}
    </span>
  );
}

export function PricingComparison() {
  const rows = COMPARISON_ROWS;

  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="p-7 lg:p-9">
        <CardTitle className="text-2xl text-slate-900 lg:text-3xl">Compare plans</CardTitle>
        <p className="max-w-2xl text-sm text-slate-600 sm:text-base">
          Cash recovery, payment tracking, and collections — not just invoice generation.
          See what each plan includes.
        </p>
      </CardHeader>
      <CardContent className="overflow-x-auto p-7 pt-0 lg:p-9 lg:pt-0">
        <table className="min-w-[720px] w-full table-fixed border-collapse text-sm lg:text-[15px]">
          <colgroup>
            <col className="w-[38%]" />
            <col className="w-[20.66%]" />
            <col className="w-[20.66%]" />
            <col className="w-[20.66%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-200">
              <th
                scope="col"
                className="py-5 pr-6 text-left text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                Feature
              </th>
              <th
                scope="col"
                className="px-3 py-5 text-center text-sm font-semibold text-slate-900 lg:text-base"
              >
                Starter
              </th>
              <th
                scope="col"
                className="px-3 py-5 text-center text-sm font-semibold text-blue-700 lg:text-base"
              >
                Pro
              </th>
              <th
                scope="col"
                className="px-3 py-5 text-center text-sm font-semibold text-slate-900 lg:text-base"
              >
                Business
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.label}
                className={
                  row.highlight
                    ? "border-b border-slate-200 bg-slate-50/80"
                    : "border-b border-slate-100 last:border-b-0"
                }
              >
                <td className="py-4 pr-6 text-left font-medium text-slate-800">{row.label}</td>
                <td className="px-3 py-4 text-center align-middle">
                  <CellContent value={row.starter} emphasized={row.highlight} />
                </td>
                <td className="px-3 py-4 text-center align-middle">
                  <CellContent value={row.pro} emphasized={row.highlight} />
                </td>
                <td className="px-3 py-4 text-center align-middle">
                  <CellContent value={row.business} emphasized={row.highlight} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
