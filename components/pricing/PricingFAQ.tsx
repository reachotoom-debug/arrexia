import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPublicTrialMicrocopy } from "@/lib/billing/plans";

const FAQ = [
  {
    q: "Is Arrexia just for creating invoices?",
    a: "No. Arrexia is an AI-powered accounts receivable and collections platform built around receivables tracking, automated payment follow-up, overdue visibility, and cash recovery.",
  },
  {
    q: "Do I need a credit card to get started?",
    a: `No. ${formatPublicTrialMicrocopy()}.`,
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
    q: "What happens after the free trial?",
    a: "When your 14-day trial ends, you'll need a paid plan to keep creating and updating invoices, clients, and collections workflows. Your data stays available.",
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
            <h3 className="text-base font-semibold text-slate-900 sm:text-lg">{item.q}</h3>
            <p className="text-sm leading-relaxed text-slate-600 sm:text-base">{item.a}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
