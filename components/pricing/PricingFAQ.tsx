import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const FAQ = [
  {
    q: "Is Arrexia just an invoice generator?",
    a: "No. Arrexia is built around payment collection, overdue tracking, reminders, and receivables visibility.",
  },
  {
    q: "Do I need a credit card for trial?",
    a: "No.",
  },
  {
    q: "Can I upgrade later?",
    a: "Yes, anytime.",
  },
  {
    q: "Is this for freelancers only?",
    a: "No — freelancers, agencies, consultants, and SMBs use Arrexia.",
  },
  {
    q: "What happens after trial?",
    a: "Choose a plan that fits your business.",
  },
];

export function PricingFAQ() {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="p-7 lg:p-9">
        <CardTitle className="text-2xl text-slate-900 lg:text-3xl">FAQ</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6 p-7 pt-0 sm:space-y-8 lg:p-9 lg:pt-0">
        {FAQ.map((item) => (
          <div key={item.q} className="space-y-2 border-b border-slate-100 pb-6 last:border-0 last:pb-0">
            <p className="text-base font-semibold text-slate-900 sm:text-lg">{item.q}</p>
            <p className="text-sm leading-relaxed text-slate-600 sm:text-base">{item.a}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
