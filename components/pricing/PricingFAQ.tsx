import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const FAQ = [
  {
    q: "Do you lock my data if I don’t pay?",
    a: "No. Your data is always accessible.",
  },
  {
    q: "Can I change plans later?",
    a: "Yes, anytime.",
  },
  {
    q: "When will WhatsApp & payment links be available?",
    a: "Soon — Pro users first.",
  },
];

export function PricingFAQ() {
  return (
    <Card className="border-slate-200">
      <CardHeader>
        <CardTitle className="text-lg text-slate-900">FAQ</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm text-slate-700">
        {FAQ.map((item) => (
          <div key={item.q} className="space-y-1">
            <p className="font-semibold text-slate-900">{item.q}</p>
            <p className="text-slate-700">{item.a}</p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
