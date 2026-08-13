"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ImportCard } from "./ImportCard";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { previewClientsImport, executeClientsImport, type PreviewRow, type PreviewResult } from "../actions/clients";
import { CLIENTS_EXPORT_HEADERS } from "../_constants";
import { downloadSampleFile, runSampleDownloadTask } from "../_lib/sampleFiles";
import { buildClientsSampleTsv, buildClientsSampleCsv } from "../_spec/clients";
import {
  generateExecutableCleanedFile,
  generateErrorReport,
  downloadFile,
  isExecutableImportPreviewRow,
} from "../_lib/downloadReports";

interface ImportClientsSectionProps {
  workspaceId: string;
}

/**
 * Download sample TSV file (recommended)
 */
function createClientsSampleTsvDownload(): void {
  downloadSampleFile(
    buildClientsSampleTsv(),
    "clients_sample.tsv",
    "text/tab-separated-values;charset=utf-8;"
  );
}

/**
 * Download sample CSV file
 */
function createClientsSampleCsvDownload(): void {
  downloadSampleFile(
    buildClientsSampleCsv(),
    "clients_sample.csv",
    "text/csv;charset=utf-8;"
  );
}

export function ImportClientsSection({ workspaceId }: ImportClientsSectionProps) {
  const router = useRouter();
  const [fileSelected, setFileSelected] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isDownloadingSample, setIsDownloadingSample] = useState(false);
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

  const handleDownloadSampleTSV = () => {
    void runSampleDownloadTask(createClientsSampleTsvDownload, {
      onStart: () => setIsDownloadingSample(true),
      onEnd: () => setIsDownloadingSample(false),
      onError: (err) => {
        console.error("[ImportClientsSection] sample TSV download failed:", err);
        setError(err instanceof Error ? err.message : "Failed to download sample TSV");
      },
    });
  };

  const handleDownloadSampleCSV = () => {
    void runSampleDownloadTask(createClientsSampleCsvDownload, {
      onStart: () => setIsDownloadingSample(true),
      onEnd: () => setIsDownloadingSample(false),
      onError: (err) => {
        console.error("[ImportClientsSection] sample CSV download failed:", err);
        setError(err instanceof Error ? err.message : "Failed to download sample CSV");
      },
    });
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
    ? preview.ok &&
      preview.header_ok &&
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
      {executeResults.every((r) => r.status === "ok") && preview?.rows ? (
        <p className="text-sm text-green-700">
          Created: {preview.rows.filter((r) => r.action === "insert").length} · Updated:{" "}
          {preview.rows.filter((r) => r.action === "update").length} · Failed: 0
        </p>
      ) : null}
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

  const hasExecutableRows =
    preview?.rows?.some((row) => isExecutableImportPreviewRow(row.action)) ?? false;

  // Download cleaned file handler — executable INSERT/UPDATE rows only (excludes FAIL/SKIP)
  const handleDownloadCleanedFile = () => {
    if (!preview?.normalizedRows || !preview.delimiter || !preview.rows) return;
    // Use original headers from normalized rows
    const headers = preview.normalizedRows.length > 0 
      ? Object.keys(preview.normalizedRows[0])
      : CLIENTS_EXPORT_HEADERS;
    const format = preview.delimiter === "\t" ? "tsv" : "csv";
    const cleaned = generateExecutableCleanedFile(
      headers,
      preview.normalizedRows,
      preview.rows,
      format
    );
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
      description="Upload a CSV or TSV file with client data. Only 'Name' is required. Phone and WhatsApp are separate columns. For Excel, use TSV and store phone columns as Text to avoid scientific notation."
      importantNote="Columns: Name (required), Email, Company, Country, Phone, WhatsApp, Payment Terms Days, Status. Phone and WhatsApp map to distinct client fields."
      fileInputId="clients-file-input"
      onFileSelect={handleFileSelect}
      onDownloadSampleTSV={handleDownloadSampleTSV}
      onDownloadSampleCSV={handleDownloadSampleCSV}
      isLoading={isLoading}
      isDownloadingSample={isDownloadingSample}
      isExecuting={isExecuting}
      error={error}
      previewErrors={preview?.errors || []}
      counts={counts}
      previewTable={previewTable}
      executeResults={executeResultsTable}
      canExecute={canExecute}
      onExecute={handleExecute}
      fileSelected={fileSelected}
      onDownloadCleanedFile={
        preview?.normalizedRows && hasExecutableRows ? handleDownloadCleanedFile : undefined
      }
      onDownloadErrorReport={preview?.rows && preview.rows.some((r) => r.action === "fail") ? handleDownloadErrorReport : undefined}
      showDownloadButtons={!!preview}
    />
  );
}
