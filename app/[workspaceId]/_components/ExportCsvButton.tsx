"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { secondaryToolbarClass } from "@/components/ui/cta-styles";
import { useToast } from "@/components/ui/use-toast";
import { Download } from "lucide-react";

interface ExportCsvButtonProps {
  workspaceId: string;
  module: "clients" | "invoices" | "payments";
  label?: string;
}

export function ExportCsvButton({ workspaceId, module, label = "Export CSV" }: ExportCsvButtonProps) {
  const [isExporting, setIsExporting] = useState(false);
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const handleExport = async () => {
    setIsExporting(true);

    try {
      // Build export URL with current query params
      const params = new URLSearchParams();
      params.set("workspaceId", workspaceId);

      // Copy relevant query params from current page
      searchParams.forEach((value, key) => {
        // Skip pagination params
        if (key === "page" || key === "pageSize") {
          return;
        }
        // Copy filters, search, sort params
        params.set(key, value);
      });

      const exportUrl = `/api/export/${module}?${params.toString()}`;

      // Fetch CSV
      const response = await fetch(exportUrl);

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: "Failed to export" }));
        throw new Error(error.error || "Failed to export CSV");
      }

      // Get CSV content
      const csv = await response.text();

      // Trigger download
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;

      // Generate filename from response or create default
      const contentDisposition = response.headers.get("Content-Disposition");
      let filename = `Arrexia_${workspaceId}_${module}_${new Date().toISOString().split("T")[0]}.csv`;
      if (contentDisposition) {
        const filenameMatch = contentDisposition.match(/filename="(.+)"/);
        if (filenameMatch) {
          filename = filenameMatch[1];
        }
      }

      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast({
        title: "Export successful",
        description: `CSV file downloaded successfully.`,
      });
    } catch (error) {
      console.error("[Export CSV] Error:", error);
      toast({
        title: "Export failed",
        description: error instanceof Error ? error.message : "Failed to export CSV",
        variant: "destructive",
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleExport}
      disabled={isExporting}
      className={cn(secondaryToolbarClass, "gap-2")}
    >
      <Download className="h-4 w-4 shrink-0" />
      {isExporting ? "Exporting..." : label}
    </button>
  );
}

