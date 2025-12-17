import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FeatureItem, FeatureList } from "./FeatureList";
import Link from "next/link";

type LimitItem = {
  label: string;
  value: string;
};

interface PricingCardProps {
  name: string;
  price: string;
  description: string;
  limits: LimitItem[];
  features: FeatureItem[];
  ctaLabel: string;
  ctaHref?: string | null;
  disabled?: boolean;
  highlight?: boolean;
  footnote?: string;
}

export function PricingCard({
  name,
  price,
  description,
  limits,
  features,
  ctaLabel,
  ctaHref,
  disabled,
  highlight,
  footnote,
}: PricingCardProps) {
  const content = (
    <Card
      className={`flex h-full flex-col border-slate-200 bg-white shadow-sm ${
        highlight ? "border-slate-900 shadow-md" : ""
      }`}
    >
      <CardHeader className="space-y-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-semibold text-slate-900">
            {name}
          </CardTitle>
          {highlight ? (
            <Badge className="bg-slate-900 text-white">Most Popular</Badge>
          ) : null}
        </div>
        <div className="text-3xl font-semibold text-slate-900">{price}</div>
        <p className="text-sm text-slate-600">{description}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-6">
        <div className="space-y-2 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
          {limits.map((limit) => (
            <div key={limit.label} className="flex items-center justify-between">
              <span className="text-slate-600">{limit.label}</span>
              <span className="font-semibold text-slate-900">{limit.value}</span>
            </div>
          ))}
        </div>

        <FeatureList items={features} />

        {ctaHref && !disabled ? (
          <Link href={ctaHref} className="w-full">
            <Button variant={highlight ? "default" : "outline"} className="w-full">
              {ctaLabel}
            </Button>
          </Link>
        ) : (
          <Button
            variant={highlight ? "default" : "outline"}
            className="w-full"
            disabled
          >
            {ctaLabel}
          </Button>
        )}

        {footnote ? (
          <p className="text-xs text-slate-500">{footnote}</p>
        ) : null}
      </CardContent>
    </Card>
  );

  return content;
}
