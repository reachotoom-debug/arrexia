"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ImportCard } from "./ImportCard";
import { Button } from "@/components/ui/button";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { HorizontalScrollArea } from "@/components/table/HorizontalScrollArea";
import { TABLE_MIN_WIDTH_INNER } from "@/components/table/tableShell";
import { 
  previewInvoicesImport, 
  executeInvoicesImport, 
  getWorkspaceClientsForSample
} from "../actions/invoices";
import { 
  INVOICE_HEADER_COUNT,
  buildInvoicesSampleTsvWithClients,
  buildInvoicesSampleCsvWithClients,
  type PreviewResult 
} from "../_lib/invoicesGroupedFormat";

interface ImportInvoicesSectionProps {
  workspaceId: string;
}

/**
 * Download helper - creates and triggers a file download
 */
function triggerDownload(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function ImportInvoicesSection({ workspaceId }: ImportInvoicesSectionProps) {
  const router = useRouter();
  const [fileSelected, setFileSelected] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executeResults, setExecuteResults] = useState<Array<{
    rowId: string;
    invoice_number: string;
    status: "ok" | "failed";
    invoice_id: string | null;
    error: string | null;
  }> | null>(null);

  /**
   * Download sample TSV with workspace clients (RECOMMENDED)
   * Uses real workspace clients so the sample works out of the box
   */
  const handleDownloadSampleTSV = async () => {
    try {
      const clients = await getWorkspaceClientsForSample(workspaceId);
      const tsv = buildInvoicesSampleTsvWithClients(clients);
      triggerDownload(tsv, "invoices_sample.tsv", "text/tab-separated-values");
    } catch (err) {
      console.error("Failed to generate sample TSV:", err);
      // Fallback to static sample
      const tsv = buildInvoicesSampleTsvWithClients([]);
      triggerDownload(tsv, "invoices_sample.tsv", "text/tab-separated-values");
    }
  };

  /**
   * Download sample CSV with workspace clients
   */
  const handleDownloadSampleCSV = async () => {
    try {
      const clients = await getWorkspaceClientsForSample(workspaceId);
      const csv = buildInvoicesSampleCsvWithClients(clients);
      triggerDownload(csv, "invoices_sample.csv", "text/csv");
    } catch (err) {
      console.error("Failed to generate sample CSV:", err);
      // Fallback to static sample
      const csv = buildInvoicesSampleCsvWithClients([]);
      triggerDownload(csv, "invoices_sample.csv", "text/csv");
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setFileSelected(true);
    setError(null);
    setPreview(null);
    setExecuteResults(null);
    setIsLoading(true);

    try {
      // Read file as text
      const fileText = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          resolve(e.target?.result as string);
        };
        reader.onerror = () => {
          reject(new Error("Failed to read file"));
        };
        reader.readAsText(file);
      });

      // Call previewInvoicesImport
      const result = await previewInvoicesImport(workspaceId, fileText);
      setPreview(result);
      
      // Set error if there are validation errors
      if (result.errors.length > 0) {
        setError(result.errors.join("; "));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to preview import");
    } finally {
      setIsLoading(false);
    }
  };

  const handleExecute = async () => {
    // Guard: refuse to execute if preview has errors
    if (!preview || !preview.ok || !preview.invoiceGroups || preview.invoiceGroups.length === 0) {
      setError("Cannot execute import: preview has validation errors. Please fix all errors before importing.");
      return;
    }

    setIsExecuting(true);
    setError(null);
    setExecuteResults(null);

    try {
      const result = await executeInvoicesImport(workspaceId, preview.invoiceGroups);
      setExecuteResults(result.results);
      
      if (result.ok) {
        // Count inserts and updates from preview
        const inserts = preview.rows.filter((r) => r.action === "insert" && r.validation_errors.length === 0).length;
        const updates = preview.rows.filter((r) => r.action === "update" && r.validation_errors.length === 0).length;
        
        // Show success and refresh
        router.refresh();
      } else if (result.errors.length > 0) {
        setError(result.errors.join("; "));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to execute import");
    } finally {
      setIsExecuting(false);
    }
  };

  // Calculate counts
  const counts = preview?.rows
    ? {
        insert: preview.rows.filter((r) => r.action === "insert").length,
        update: preview.rows.filter((r) => r.action === "update").length,
        fail: preview.rows.filter((r) => r.validation_errors.length > 0).length,
      }
    : null;

  // Enable Execute button only if:
  // - preview exists
  // - preview.ok === true (no global errors AND no validation errors in any row)
  // - preview.header_ok === true
  // - at least one invoice group to import
  const canExecute = preview
    ? preview.ok &&
      preview.header_ok &&
      preview.invoiceGroups.length > 0
    : false;

  // Hint banner for failed rows (client not found)
  const hintBanner = preview?.rows && preview.rows.some((r) => r.validation_errors.length > 0) ? (
    <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm text-blue-800 font-semibold mb-1">
            Invoices require existing clients. Import Clients first.
          </p>
          <p className="text-sm text-blue-700">
            Failed invoices are missing clients in this workspace. Import clients before importing invoices.
          </p>
        </div>
        <Link
          href={`/${workspaceId}/settings/import?tab=clients`}
          className="ml-4"
        >
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="whitespace-nowrap"
          >
            Go to Clients Import
          </Button>
        </Link>
      </div>
    </div>
  ) : null;

  // Preview table
  const previewTable = preview?.rows && preview.rows.length > 0 ? (
    <div className="space-y-3">
      {/* Banner: Clients must exist first */}
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
        <strong>Note:</strong> Invoice import requires clients to exist in this workspace. 
        If you see &quot;Client not found&quot; errors, please{" "}
        <Link href={`/${workspaceId}/settings/import`} className="underline font-medium">
          import Clients first
        </Link>.
      </div>

      <HorizontalScrollArea
        className="relative w-full min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm"
        viewportClassName="overflow-x-auto scrollbar-thin scrollbar-transparent"
      >
        <Table className={`${TABLE_MIN_WIDTH_INNER} w-full`}>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Client</TableHead>
              <TableHead>Total</TableHead>
              <TableHead>Items</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Reason</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {preview.rows.map((row) => {
              // Determine action display based on errors
              const hasClientError = row.validation_errors.some(err => 
                err.toLowerCase().includes("client not found")
              );
              const hasOtherErrors = row.validation_errors.length > 0;
              
              // If client not found, show SKIP instead of UPDATE
              let displayAction = row.action?.toUpperCase() || "-";
              if (hasClientError) {
                displayAction = "SKIP";
              } else if (hasOtherErrors && !row.action) {
                displayAction = "FAIL";
              }
              
              const actionColor =
                displayAction === "INSERT"
                  ? "text-green-600"
                  : displayAction === "UPDATE"
                  ? "text-blue-600"
                  : displayAction === "SKIP"
                  ? "text-amber-600"
                  : "text-red-600";

              // Get client identifier from preview row or invoice group
              const invoiceGroup = preview.invoiceGroups.find(g => g.invoice_number === row.invoice_number);
              const clientIdentifier = row.client_name || invoiceGroup?.client_email || "-";

              return (
                <TableRow key={row.rowId}>
                  <TableCell className="font-medium whitespace-nowrap">{row.invoice_number || "-"}</TableCell>
                  <TableCell className="text-sm text-slate-600 break-words">
                    {clientIdentifier}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">
                    {new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: row.currency || "USD",
                    }).format(row.computed_total)}
                  </TableCell>
                  <TableCell className="text-sm text-slate-600 whitespace-nowrap">
                    {row.items_count} item(s)
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <span className={`font-medium ${actionColor}`}>
                      {displayAction}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {row.validation_errors.length > 0 ? (
                      <ul className="list-disc list-inside text-red-600">
                        {row.validation_errors.map((err, idx) => (
                          <li key={idx}>{err}</li>
                        ))}
                      </ul>
                    ) : (
                      "-"
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </HorizontalScrollArea>
    </div>
  ) : null;

  // Execute results
  const executeResultsTable = executeResults ? (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-900">Import Results</h3>
      <HorizontalScrollArea
        className="relative w-full min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm"
        viewportClassName="overflow-x-auto scrollbar-thin scrollbar-transparent"
      >
        <Table className={`${TABLE_MIN_WIDTH_INNER} w-full`}>
          <TableHeader>
            <TableRow>
              <TableHead>Invoice #</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Invoice ID</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {executeResults.map((result) => {
              return (
                <TableRow key={result.rowId}>
                  <TableCell className="font-medium">
                    {result.invoice_number || "-"}
                  </TableCell>
                  <TableCell>
                    <span
                      className={`font-medium ${
                        result.status === "ok" ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {result.status.toUpperCase()}
                    </span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">
                    {result.invoice_id || "-"}
                  </TableCell>
                  <TableCell className="text-xs text-slate-600">
                    {result.error || "-"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </HorizontalScrollArea>
    </div>
  ) : null;

  return (
    <ImportCard
      title="Import Invoices (Grouped CSV/TSV)"
      description="Upload a TSV (recommended) or CSV file in grouped format. Each invoice has 1 header row (Row Type=invoice) + 1 or more item rows (Row Type=item). Invoice Number is required for all rows. Dates: YYYY-MM-DD or M/D/YYYY. Currency defaults to workspace default if blank."
      importantNote={`${INVOICE_HEADER_COUNT} columns required: Row Type, Invoice Number, Client Name, Client Email, Issue Date, Due Date, Currency, Status, PO Number, Notes, Item Description, Quantity, Unit Price, Amount`}
      fileInputId="invoices-file-input"
      onFileSelect={handleFileSelect}
      onDownloadSampleTSV={handleDownloadSampleTSV}
      onDownloadSampleCSV={handleDownloadSampleCSV}
      isLoading={isLoading}
      isExecuting={isExecuting}
      error={error}
      previewErrors={preview?.errors || []}
      wrongFileType={preview?.wrong_file_type || null}
      hintBanner={hintBanner}
      counts={counts}
      previewTable={previewTable}
      executeResults={executeResultsTable}
      canExecute={canExecute}
      onExecute={handleExecute}
      fileSelected={fileSelected}
    />
  );
}
