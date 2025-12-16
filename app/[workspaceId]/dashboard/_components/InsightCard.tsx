import { Lightbulb } from "lucide-react";

interface InsightCardProps {
  insight: string;
}

export function InsightCard({ insight }: InsightCardProps) {
  return (
    <div className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-blue-100/50 p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-200">
          <Lightbulb className="h-4 w-4 text-blue-700" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-blue-900 mb-1">Dashboard Insight</h3>
          <p className="text-sm text-blue-800 leading-relaxed">{insight}</p>
        </div>
      </div>
    </div>
  );
}
