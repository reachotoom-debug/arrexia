import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { AlertCircle } from "lucide-react";

export function InactiveBanner() {
  return (
    <Card className="flex items-center gap-3 border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      <AlertCircle className="h-4 w-4 text-amber-600" />
      <Badge variant="secondary" className="bg-amber-100 text-amber-800">
        Inactive
      </Badge>
      <span>
        This client is inactive. Some actions may be disabled.
      </span>
    </Card>
  );
}
