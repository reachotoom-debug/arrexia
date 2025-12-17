import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const ROWS = [
  { label: "Invoices / month", free: "5", starter: "100", pro: "Unlimited" },
  { label: "Clients", free: "5", starter: "Unlimited", pro: "Unlimited" },
  { label: "Email reminders", free: "Manual", starter: "Automatic", pro: "Advanced rules" },
  { label: "Collections", free: "Overdue tracking", starter: "Collections mode (basic)", pro: "Collections cockpit" },
  { label: "Audit trail", free: "Basic activity", starter: "Basic activity", pro: "Reminder history & audit" },
];

export function PricingComparison() {
  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="text-lg text-slate-900">Compare plans</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="min-w-full text-sm text-slate-700">
          <thead>
            <tr className="text-left">
              <th className="py-3 pr-4 font-semibold text-slate-600">Feature</th>
              <th className="py-3 px-4 font-semibold text-slate-900">Free</th>
              <th className="py-3 px-4 font-semibold text-slate-900">Starter</th>
              <th className="py-3 px-4 font-semibold text-slate-900">Pro</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label} className="border-t border-slate-100">
                <td className="py-3 pr-4 text-slate-700">{row.label}</td>
                <td className="py-3 px-4">{row.free}</td>
                <td className="py-3 px-4">{row.starter}</td>
                <td className="py-3 px-4">{row.pro}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
