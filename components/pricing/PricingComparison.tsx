import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPublicComparisonPriceRow, PUBLIC_PRICING } from "@/lib/billing/plans";
import { Check } from "lucide-react";

type ComparisonRow = {
  label: string;
  starter: string;
  pro: string;
  business: string;
  enterprise: string;
  highlight?: boolean;
};

const COMPARISON_ROWS: ComparisonRow[] = [
  {
    label: "Price",
    starter: formatPublicComparisonPriceRow("starter"),
    pro: formatPublicComparisonPriceRow("pro"),
    business: formatPublicComparisonPriceRow("business"),
    enterprise: formatPublicComparisonPriceRow("enterprise"),
    highlight: true,
  },
  {
    label: "Free trial",
    starter: `✓ ${PUBLIC_PRICING.trialDays} days`,
    pro: `✓ ${PUBLIC_PRICING.trialDays} days`,
    business: `✓ ${PUBLIC_PRICING.trialDays} days`,
    enterprise: "Contact Sales",
  },
  {
    label: "Active clients",
    starter: "Up to 25",
    pro: "Up to 250",
    business: "Higher limits",
    enterprise: "Custom",
  },
  {
    label: "Invoices per month",
    starter: "Up to 50",
    pro: "Up to 500",
    business: "Higher limits",
    enterprise: "Custom",
  },
  {
    label: "Workspace members",
    starter: "1",
    pro: "Up to 3",
    business: "Team permissions",
    enterprise: "Custom",
  },
  { label: "Client management", starter: "✓", pro: "✓", business: "✓", enterprise: "✓" },
  { label: "Invoice management", starter: "✓", pro: "✓", business: "✓", enterprise: "✓" },
  { label: "Branded PDF invoices", starter: "✓", pro: "✓", business: "✓", enterprise: "✓" },
  { label: "Manual payment tracking", starter: "✓", pro: "✓", business: "✓", enterprise: "✓" },
  { label: "Basic dashboard", starter: "✓", pro: "✓", business: "✓", enterprise: "✓" },
  { label: "Basic risk score", starter: "✓", pro: "✓", business: "✓", enterprise: "✓" },
  { label: "Manual reminders", starter: "✓", pro: "✓", business: "✓", enterprise: "✓" },
  { label: "Reminder history", starter: "✓", pro: "✓", business: "✓", enterprise: "✓" },
  { label: "Export data", starter: "✓", pro: "✓", business: "✓", enterprise: "✓" },
  { label: "Automated reminder rules", starter: "—", pro: "✓", business: "✓", enterprise: "✓" },
  { label: "Suggested reminders", starter: "—", pro: "✓", business: "✓", enterprise: "✓" },
  { label: "Collection workflows", starter: "—", pro: "✓", business: "✓", enterprise: "✓" },
  { label: "Advanced risk analysis", starter: "—", pro: "✓", business: "✓", enterprise: "✓" },
  { label: "Collections dashboard", starter: "—", pro: "✓", business: "✓", enterprise: "✓" },
  { label: "Email templates", starter: "—", pro: "✓", business: "✓", enterprise: "✓" },
  { label: "CSV import/export", starter: "—", pro: "✓", business: "✓", enterprise: "✓" },
  { label: "Priority support", starter: "—", pro: "✓", business: "✓", enterprise: "✓" },
  { label: "Custom domain", starter: "—", pro: "—", business: "✓", enterprise: "✓" },
  { label: "API access", starter: "—", pro: "—", business: "✓", enterprise: "✓" },
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
      <span className="text-base font-light text-slate-400" aria-label="Not included">
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
        <table className="min-w-[880px] w-full table-fixed border-collapse text-sm lg:text-[15px]">
          <colgroup>
            <col className="w-[30%]" />
            <col className="w-[17.5%]" />
            <col className="w-[17.5%]" />
            <col className="w-[17.5%]" />
            <col className="w-[17.5%]" />
          </colgroup>
          <thead>
            <tr className="border-b border-slate-200">
              <th
                scope="col"
                className="py-5 pr-6 text-left text-xs font-semibold uppercase tracking-wide text-slate-600"
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
              <th
                scope="col"
                className="px-3 py-5 text-center text-sm font-semibold text-slate-900 lg:text-base"
              >
                Enterprise
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
                <td className="px-3 py-4 text-center align-middle">
                  <CellContent value={row.enterprise} emphasized={row.highlight} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
