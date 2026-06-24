import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FeatureItem, FeatureList } from "./FeatureList";
import Link from "next/link";

interface PricingCardProps {
  name: string;
  price: string;
  period?: string | null;
  subtitle: string;
  features: readonly FeatureItem[];
  ctaLabel: string;
  ctaHref?: string | null;
  disabled?: boolean;
  highlight?: boolean;
  footnote?: string;
  badgeLabel?: string;
  secondaryBadge?: string;
  equivalentSubtext?: string;
  savingsBadge?: string;
  showTrialMicrocopy?: boolean;
}

export function PricingCard({
  name,
  price,
  period,
  subtitle,
  features,
  ctaLabel,
  ctaHref,
  disabled,
  highlight,
  footnote,
  badgeLabel = "Most Popular",
  secondaryBadge,
  equivalentSubtext,
  savingsBadge,
  showTrialMicrocopy,
}: PricingCardProps) {
  return (
    <Card
      className={`flex h-full flex-col border-slate-200 bg-white shadow-sm ${
        highlight ? "border-blue-600 ring-2 ring-blue-600/15 lg:scale-[1.02]" : ""
      }`}
    >
      <CardHeader className="space-y-4 p-7 lg:space-y-5 lg:p-9">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="text-2xl font-semibold text-slate-900 lg:text-3xl">
            {name}
          </CardTitle>
          <div className="flex flex-wrap justify-end gap-2">
            {highlight ? (
              <Badge className="bg-blue-600 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-white">
                {badgeLabel}
              </Badge>
            ) : null}
            {secondaryBadge ? (
              <Badge className="border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                {secondaryBadge}
              </Badge>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-1 gap-y-1">
            <span className="text-4xl font-semibold tracking-tight text-slate-900 lg:text-5xl">
              {price}
            </span>
            {period ? (
              <span className="text-base text-slate-500 lg:text-lg">{period}</span>
            ) : null}
          </div>
          {equivalentSubtext ? (
            <p className="text-sm text-slate-600">{equivalentSubtext}</p>
          ) : null}
          {savingsBadge ? (
            <Badge className="bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">
              {savingsBadge}
            </Badge>
          ) : null}
        </div>

        <p className="text-sm text-slate-600 sm:text-base">{subtitle}</p>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-7 p-7 pt-0 lg:gap-8 lg:p-9 lg:pt-0">
        <FeatureList items={features} />

        <div className="mt-auto space-y-3">
          {ctaHref && !disabled ? (
            <Link href={ctaHref} className="block w-full">
              <Button
                variant={highlight ? "default" : "outline"}
                size="lg"
                className="h-12 w-full text-base"
              >
                {ctaLabel}
              </Button>
            </Link>
          ) : (
            <Button
              variant={highlight ? "default" : "outline"}
              size="lg"
              className="h-12 w-full text-base"
              disabled
            >
              {ctaLabel}
            </Button>
          )}

          {showTrialMicrocopy ? (
            <p className="text-center text-xs text-slate-500">
              14-day free trial • No credit card required
            </p>
          ) : null}

          {footnote ? (
            <p className="text-center text-xs text-slate-500 sm:text-sm">{footnote}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
