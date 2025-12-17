import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface PlanLimitBannerProps {
  code: "PLAN_LIMIT_INVOICES" | "PLAN_LIMIT_CLIENTS";
}

export function PlanLimitBanner({ code }: PlanLimitBannerProps) {
  const label =
    code === "PLAN_LIMIT_INVOICES"
      ? "You’ve reached your invoice limit for this plan."
      : "You’ve reached your client limit for this plan.";

  return (
    <Card className="flex items-center justify-between gap-4 border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <div className="flex items-center gap-3">
        <Badge variant="secondary" className="bg-amber-100 text-amber-800">
          Plan limit
        </Badge>
        <span>{label} Upgrade anytime.</span>
      </div>
      <Link
        href="/pricing"
        className="text-sm font-semibold text-amber-900 underline underline-offset-4"
      >
        View plans
      </Link>
    </Card>
  );
}
