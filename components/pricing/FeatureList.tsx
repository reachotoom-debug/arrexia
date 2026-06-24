import { Badge } from "@/components/ui/badge";
import { Check, Clock } from "lucide-react";

export type FeatureItem = {
  label: string;
  comingSoon?: boolean;
  subtleNote?: string;
};

interface FeatureListProps {
  items: readonly FeatureItem[];
}

export function FeatureList({ items }: FeatureListProps) {
  return (
    <ul className="space-y-3 lg:space-y-4">
      {items.map((item) => (
        <li key={item.label} className="flex items-start gap-3 text-sm text-slate-700 sm:text-base">
          {item.comingSoon ? (
            <Clock className="mt-0.5 h-4 w-4 text-amber-500" aria-hidden="true" />
          ) : (
            <Check className="mt-0.5 h-4 w-4 text-emerald-600" aria-hidden="true" />
          )}
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <span>{item.label}</span>
              {item.subtleNote ? (
                <span className="text-xs text-slate-500">{item.subtleNote}</span>
              ) : null}
            </div>
            {item.comingSoon ? (
              <Badge variant="secondary" className="bg-slate-100 text-slate-700">
                Coming Soon
              </Badge>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
