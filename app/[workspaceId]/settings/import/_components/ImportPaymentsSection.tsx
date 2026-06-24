"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImportCard } from "./ImportCard";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { previewPaymentsImport, executePaymentsImport, type PreviewRow, type PreviewResult } from "../actions/payments";
import { formatMoney } from "@/lib/utils/format-money";
import { downloadSampleFile } from "../_lib/sampleFiles";
import { buildPaymentsSampleTsv, buildPaymentsSampleCsv, PAYMENTS_EXPORT_HEADERS } from "../_spec/payments";
import {
  generateCleanedFile,
  generateErrorReport,
  downloadFile,
} from "../_lib/downloadReports";

interface ImportPaymentsSectionProps {
  workspaceId: string;
}

/**
 * Download sample TSV file (recommended)
 */
function downloadSampleTSV() {
  const tsv = buildPaymentsSampleTsv();
  downloadSampleFile(tsv, "payments_sample.tsv", "text/tab-separated-values;charset=utf-8;");
}

/**
 * Download sample CSV file
 */
function downloadSampleCSV() {
  const csv = buildPaymentsSampleCsv();
  downloadSampleFile(csv, "payments_sample.csv", "text/csv;charset=utf-8;");
}

export function ImportPaymentsSection({ workspaceId }: ImportPaymentsSectionProps) {
  const router = useRouter();
  const [fileSelected, setFileSelected] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executeResults, setExecuteResults] = useState<Array<{
    rowId: string;
    rowIndex: number;
    payment_id: string | null;
    status: "ok" | "failed";
    error_message: string | null;
  }> | null>(null);

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

      // Call previewPaymentsImport
      const result = await previewPaymentsImport(workspaceId, fileText);
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
    if (!preview || !preview.header_ok || !preview.rows || preview.rows.length === 0) {
      setError("Cannot execute import: preview has validation errors. Please fix all errors before importing.");
      return;
    }

    setIsExecuting(true);
    setError(null);
    setExecuteResults(null);

    try {
      const results = await executePaymentsImport(workspaceId, preview.rows);
      setExecuteResults(results);
      
      if (results.every((r) => r.status === "ok")) {
        // Show success and refresh
        router.refresh();
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
        skip: preview.rows.filter((r) => r.action === "skip").length,
        fail: preview.rows.filter((r) => r.action === "fail").length,
      }
    : null;

  // Enable Execute button only if:
  // - preview exists
  // - preview.header_ok === true
  // - preview.errors.length === 0
  // - no row.action === "fail"
  // - at least one row.action === "insert" OR "update"
  const canExecute = preview
    ? preview.header_ok &&
      preview.errors.length === 0 &&
      !preview.rows.some((r) => r.action === "fail") &&
      preview.rows.some((r) => r.action === "insert" || r.action === "update")
    : false;

  // Preview table
  const previewTable = preview?.rows && preview.rows.length > 0 ? (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Row</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Invoice #</TableHead>
            <TableHead>Amount</TableHead>
            <TableHead>Date</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Transaction ID</TableHead>
            <TableHead>Reason/Warnings</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {preview.rows.map((row) => {
            const actionColor =
              row.action === "insert"
                ? "text-green-600"
                : row.action === "update"
                ? "text-blue-600"
                : row.action === "skip"
                ? "text-slate-500"
                : "text-red-600";

            return (
              <TableRow key={row.rowId}>
                <TableCell className="font-mono text-xs">{row.rowIndex}</TableCell>
                <TableCell>
                  <span className={`font-medium ${actionColor}`}>
                    {row.action.toUpperCase()}
                  </span>
                </TableCell>
                <TableCell className="font-mono text-xs">
                  {row.data.invoice_number}
                </TableCell>
                <TableCell>
                  {formatMoney(row.data.amount, row.data.currency || "USD")}
                </TableCell>
                <TableCell>{row.data.payment_date}</TableCell>
                <TableCell>{row.data.status}</TableCell>
                <TableCell className="font-mono text-xs max-w-xs truncate">
                  {row.data.transaction_id}
                </TableCell>
                <TableCell className="text-xs text-slate-600">
                  <div className="space-y-1">
                    {row.reason && (
                      <div className="text-red-600">
                        {row.reason}
                        {row.reason.includes("Invoice not found") && (
                          <div className="mt-1 text-xs text-slate-500">
                            Fix: Ensure invoice exists in workspace or import invoices first.
                          </div>
                        )}
                        {row.reason.includes("Invalid invoice number") && (
                          <div className="mt-1 text-xs text-slate-500">
                            Fix: Invoice Number must be only INV-###, remove client name if present.
                          </div>
                        )}
                        {row.reason.includes("Invalid currency") && (
                          <div className="mt-1 text-xs text-slate-500">
                            Fix: Currency must be a 3-letter ISO code (e.g., USD, EUR).
                          </div>
                        )}
                        {row.reason.includes("Invalid status") && (
                          <div className="mt-1 text-xs text-slate-500">
                            Fix: Status must be one of: completed, pending, failed.
                          </div>
                        )}
                      </div>
                    )}
                    {row.warnings && row.warnings.length > 0 && (
                      <div className="text-amber-600">
                        {row.warnings.map((w, idx) => (
                          <div key={idx} className="flex items-center gap-1">
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-800">
                              Auto-fixed
                            </span>
                            <span>{w}</span>
                          </div>
                        ))}
                      </div>
                    )}
                    {!row.reason && (!row.warnings || row.warnings.length === 0) && "-"}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  ) : null;

  // Download cleaned file handler
  const handleDownloadCleanedFile = () => {
    if (!preview?.normalizedRows) return;
    const format = preview.delimiter === "\t" ? "tsv" : "csv";
    const cleaned = generateCleanedFile(PAYMENTS_EXPORT_HEADERS, preview.normalizedRows, format);
    downloadFile(cleaned, `payments_cleaned.${format}`, format === "tsv" ? "text/tab-separated-values;charset=utf-8;" : "text/csv;charset=utf-8;");
  };

  // Download error report handler
  const handleDownloadErrorReport = () => {
    if (!preview?.normalizedRows || !preview.rows) return;
    const failedCount = preview.rows.filter((r) => r.action === "fail").length;
    if (failedCount === 0) return;
    const format = preview.delimiter === "\t" ? "tsv" : "csv";
    const report = generateErrorReport(PAYMENTS_EXPORT_HEADERS, preview.normalizedRows, preview.rows, format);
    downloadFile(report, `payments_errors.${format}`, format === "tsv" ? "text/tab-separated-values;charset=utf-8;" : "text/csv;charset=utf-8;");
  };

  // Execute results
  const executeResultsTable = executeResults ? (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold text-slate-900">Import Results</h3>
      <div className="border border-slate-200 rounded-lg overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Row</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Payment ID</TableHead>
              <TableHead>Error</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {executeResults.map((result) => (
              <TableRow key={result.rowId}>
                <TableCell className="font-mono text-xs">{result.rowIndex}</TableCell>
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
                  {result.payment_id || "-"}
                </TableCell>
                <TableCell className="text-xs text-slate-600">
                  {result.error_message || "-"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  ) : null;

  return (
    <ImportCard
      title="Import Payments (CSV/TSV)"
      description="Upload one CSV or TSV file. Dates accepted: YYYY-MM-DD, MM/DD/YYYY, M/D/YYYY, or DD-MM-YYYY. TSV is recommended to avoid Excel formatting issues. Invoice Number + Amount + Payment Date are required."
      importantNote={`Every row must contain all ${PAYMENTS_EXPORT_HEADERS.length} columns; leave unused fields blank.`}
      fileInputId="payments-file-input"
      onFileSelect={handleFileSelect}
      onDownloadSampleTSV={downloadSampleTSV}
      onDownloadSampleCSV={downloadSampleCSV}
      isLoading={isLoading}
      isExecuting={isExecuting}
      error={error}
      previewErrors={preview?.errors || []}
      counts={counts}
      previewTable={previewTable}
      executeResults={executeResultsTable}
      canExecute={canExecute}
      onExecute={handleExecute}
      fileSelected={fileSelected}
      onDownloadCleanedFile={preview?.normalizedRows ? handleDownloadCleanedFile : undefined}
      onDownloadErrorReport={preview?.rows && preview.rows.some((r) => r.action === "fail") ? handleDownloadErrorReport : undefined}
      showDownloadButtons={!!preview}
      autofixes={preview?.autofixes}
    />
  );
}
