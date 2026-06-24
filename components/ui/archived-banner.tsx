import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Archive } from "lucide-react";

export function ArchivedBanner({ entityType }: { entityType: "client" | "invoice" | "payment" }) {
  return (
    <Card className="flex items-center gap-3 border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <Archive className="h-4 w-4 text-amber-600" />
      <Badge variant="secondary" className="bg-amber-100 text-amber-800">
        Archived
      </Badge>
      <span>
        This {entityType} has been archived. Some actions may be disabled.
      </span>
    </Card>
  );
}
