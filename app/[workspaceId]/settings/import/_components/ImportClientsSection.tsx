"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImportCard } from "./ImportCard";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { previewClientsImport, executeClientsImport, type PreviewRow, type PreviewResult } from "../actions/clients";
import { CLIENTS_EXPORT_HEADERS } from "../_constants";
import { downloadSampleFile } from "../_lib/sampleFiles";
import { buildClientsSampleTsv, buildClientsSampleCsv } from "../_spec/clients";
import {
  generateCleanedFile,
  generateErrorReport,
  downloadFile,
} from "../_lib/downloadReports";

interface ImportClientsSectionProps {
  workspaceId: string;
}

/**
 * Download sample TSV file (recommended)
 */
function downloadSampleTSV() {
  const tsv = buildClientsSampleTsv();
  downloadSampleFile(tsv, "clients_sample.tsv", "text/tab-separated-values;charset=utf-8;");
}

/**
 * Download sample CSV file
 */
function downloadSampleCSV() {
  const csv = buildClientsSampleCsv();
  downloadSampleFile(csv, "clients_sample.csv", "text/csv;charset=utf-8;");
}

export function ImportClientsSection({ workspaceId }: ImportClientsSectionProps) {
  const router = useRouter();
  const [fileSelected, setFileSelected] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [executeResults, setExecuteResults] = useState<Array<{
    rowId: string;
    rowIndex: number;
    client_id: string | null;
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

      // Call previewClientsImport with filename for TSV detection
      const result = await previewClientsImport(workspaceId, fileText, file.name);
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
      const result = await executeClientsImport(workspaceId, preview.rows);
      setExecuteResults(result.results);
      
      if (result.ok && result.results.every((r) => r.status === "ok")) {
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
            <TableHead>Row #</TableHead>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Action</TableHead>
            <TableHead>Reason/Warn</TableHead>
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
                <TableCell className="font-medium">{row.data.name || "-"}</TableCell>
                <TableCell className="text-sm text-slate-600">
                  {row.data.email || "-"}
                </TableCell>
                <TableCell>
                  <span className={`font-medium ${actionColor}`}>
                    {row.action.toUpperCase()}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-slate-600">
                  <div className="space-y-1">
                    {row.reason && (
                      <div className="text-red-600">{row.reason}</div>
                    )}
                    {row.warnings && row.warnings.length > 0 && (
                      <div className="text-amber-600">
                        {row.warnings.join(", ")}
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
              <TableHead>Client ID</TableHead>
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
                  {result.client_id || "-"}
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

  // Download cleaned file handler
  const handleDownloadCleanedFile = () => {
    if (!preview?.normalizedRows || !preview.delimiter) return;
    // Use original headers from normalized rows
    const headers = preview.normalizedRows.length > 0 
      ? Object.keys(preview.normalizedRows[0])
      : CLIENTS_EXPORT_HEADERS;
    const format = preview.delimiter === "\t" ? "tsv" : "csv";
    const cleaned = generateCleanedFile(headers, preview.normalizedRows, format);
    downloadFile(cleaned, `clients_cleaned.${format}`, format === "tsv" ? "text/tab-separated-values;charset=utf-8;" : "text/csv;charset=utf-8;");
  };

  // Download error report handler
  const handleDownloadErrorReport = () => {
    if (!preview?.normalizedRows || !preview.rows || !preview.delimiter) return;
    const failedCount = preview.rows.filter((r) => r.action === "fail").length;
    if (failedCount === 0) return;
    const headers = preview.normalizedRows.length > 0 
      ? Object.keys(preview.normalizedRows[0])
      : CLIENTS_EXPORT_HEADERS;
    const format = preview.delimiter === "\t" ? "tsv" : "csv";
    const report = generateErrorReport(headers, preview.normalizedRows, preview.rows, format);
    downloadFile(report, `clients_errors.${format}`, format === "tsv" ? "text/tab-separated-values;charset=utf-8;" : "text/csv;charset=utf-8;");
  };

  return (
    <ImportCard
      title="Import Clients (CSV/TSV)"
      description="Upload a CSV or TSV file with client data. Only 'Name' is required. Accepts header aliases (Client Name, Customer, etc.). Missing columns are treated as empty. Phone/WhatsApp numbers are auto-normalized."
      importantNote="Columns: Name (required), Email, Company, Country, Phone, WhatsApp, Payment Terms Days, Status"
      fileInputId="clients-file-input"
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
    />
  );
}
