"use client";

import { ReactNode } from "react";
import { SettingsCard } from "../../_components/SettingsCard";
import { Button } from "@/components/ui/button";

export interface ImportCardProps {
  title: string;
  description: string;
  importantNote: string; // e.g., "Every row must contain all X columns; leave unused fields blank."
  fileInputId: string;
  acceptExtensions?: string;
  onFileSelect: (event: React.ChangeEvent<HTMLInputElement>) => Promise<void>;
  onDownloadSampleTSV: () => void;
  onDownloadSampleCSV: () => void;
  isLoading: boolean;
  isExecuting: boolean;
  error: string | null;
  previewErrors: string[];
  wrongFileType?: "clients" | "payments" | "invoices" | null;
  hintBanner?: ReactNode; // Optional hint banner (e.g., "Invoices require existing clients")
  counts: {
    insert: number;
    update: number;
    skip?: number;
    fail: number;
  } | null;
  previewTable: ReactNode; // Custom preview table component
  executeResults: ReactNode; // Custom execute results component
  canExecute: boolean;
  onExecute: () => Promise<void>;
  /** False until the user selects a file (visual state only; execution logic unchanged). */
  fileSelected?: boolean;
  executeButtonText?: string;
  // Download reports (optional)
  onDownloadCleanedFile?: () => void;
  onDownloadErrorReport?: () => void;
  showDownloadButtons?: boolean;
  // Auto-fixes section (optional)
  autofixes?: Array<{ rowIndex: number; field: string; original: string; fixed: string; reason: string }>;
}

/**
 * Shared ImportCard component that provides consistent UI structure
 * for Clients, Invoices, and Payments import tabs
 */
export function ImportCard({
  title,
  description,
  importantNote,
  fileInputId,
  acceptExtensions = ".csv,.tsv,text/csv,text/tab-separated-values",
  onFileSelect,
  onDownloadSampleTSV,
  onDownloadSampleCSV,
  isLoading,
  isExecuting,
  error,
  previewErrors,
  wrongFileType,
  hintBanner,
  counts,
  previewTable,
  executeResults,
  canExecute,
  onExecute,
  fileSelected = false,
  executeButtonText = "Execute Import",
  onDownloadCleanedFile,
  onDownloadErrorReport,
  showDownloadButtons = false,
  autofixes,
}: ImportCardProps) {
  return (
    <SettingsCard title={title} description={description}>
      <div className="space-y-4">
        <div className="space-y-2">
          <div className="flex-1">
            <label
              htmlFor={fileInputId}
              className="block text-sm font-medium text-slate-700 mb-2"
            >
              Select File (.csv or .tsv)
            </label>
            <input
              id={fileInputId}
              type="file"
              accept={acceptExtensions}
              onChange={onFileSelect}
              disabled={isLoading || isExecuting}
              className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100 disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <p className="mt-2 text-sm text-slate-600">
              <strong>Important:</strong> {importantNote}
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onDownloadSampleTSV}
              disabled={isLoading || isExecuting}
              className="whitespace-nowrap"
            >
              Download Sample TSV (Recommended)
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={onDownloadSampleCSV}
              disabled={isLoading || isExecuting}
              className="whitespace-nowrap"
            >
              Download Sample CSV
            </Button>
          </div>
        </div>

        {/* Wrong file type detection */}
        {wrongFileType && (
          <div className="rounded-lg bg-amber-50 border border-amber-200 p-4">
            <p className="text-sm text-amber-800 font-semibold mb-2">Wrong File Type Detected</p>
            <p className="text-sm text-amber-700">
              {wrongFileType === "clients"
                ? "This looks like a Clients CSV. Switch to Clients tab or upload invoices.csv template."
                : wrongFileType === "payments"
                ? "This looks like a Payments CSV. Switch to Payments tab or upload invoices.csv template."
                : "This looks like an Invoices CSV. Switch to Invoices tab or upload the correct template."}
            </p>
          </div>
        )}

        {/* Hint banner (e.g., for missing clients) */}
        {hintBanner}

        {/* Errors */}
        {(error || previewErrors.length > 0) && !wrongFileType && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-4">
            <p className="text-sm text-red-800 font-semibold mb-2">Errors:</p>
            <ul className="text-sm text-red-700 list-disc list-inside space-y-1">
              {error && <li>{error}</li>}
              {previewErrors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Auto-fixes section */}
        {autofixes && autofixes.length > 0 && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 p-4">
            <p className="text-sm text-blue-800 font-semibold mb-2">Auto-fixes applied:</p>
            <ul className="text-sm text-blue-700 list-disc list-inside space-y-1">
              {autofixes.map((fix, idx) => (
                <li key={idx}>
                  Row {fix.rowIndex}: {fix.reason} ({fix.field}: "{fix.original}" → "{fix.fixed}")
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Loading state */}
        {isLoading && (
          <div className="text-sm text-slate-600">Loading and validating file...</div>
        )}

        {/* Counters */}
        {counts && (
          <div className={`grid gap-4 ${counts.skip !== undefined ? "grid-cols-4" : "grid-cols-3"}`}>
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <div className="text-2xl font-semibold text-green-600">{counts.insert}</div>
              <div className="text-xs text-slate-600 mt-1">Insert</div>
            </div>
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <div className="text-2xl font-semibold text-blue-600">{counts.update}</div>
              <div className="text-xs text-slate-600 mt-1">Update</div>
            </div>
            {counts.skip !== undefined && (
              <div className="text-center p-3 bg-slate-50 rounded-lg">
                <div className="text-2xl font-semibold text-slate-600">{counts.skip}</div>
                <div className="text-xs text-slate-600 mt-1">Skip</div>
              </div>
            )}
            <div className="text-center p-3 bg-slate-50 rounded-lg">
              <div className="text-2xl font-semibold text-red-600">{counts.fail}</div>
              <div className="text-xs text-slate-600 mt-1">Fail</div>
            </div>
          </div>
        )}

        {/* Preview table */}
        {previewTable}

        {/* Download reports (if preview exists and has data) */}
        {showDownloadButtons && (onDownloadCleanedFile || onDownloadErrorReport) && (
          <div className="flex gap-2">
            {onDownloadCleanedFile && (
              <Button
                type="button"
                variant="outline"
                onClick={onDownloadCleanedFile}
                disabled={isLoading || isExecuting}
                className="whitespace-nowrap"
              >
                Download Cleaned File
              </Button>
            )}
            {onDownloadErrorReport && (
              <Button
                type="button"
                variant="outline"
                onClick={onDownloadErrorReport}
                disabled={isLoading || isExecuting}
                className="whitespace-nowrap"
              >
                Download Error Report
              </Button>
            )}
          </div>
        )}

        {/* Execute results */}
        {executeResults}

        {/* Execute button */}
        <div className="flex justify-end">
          <Button
            onClick={onExecute}
            disabled={!fileSelected || !canExecute || isExecuting || isLoading}
            variant={fileSelected ? "default" : "outline"}
            className={
              fileSelected
                ? undefined
                : "border-slate-200 bg-slate-50 text-slate-400 shadow-none hover:bg-slate-50"
            }
          >
            {isExecuting ? "Executing..." : executeButtonText}
          </Button>
        </div>
      </div>
    </SettingsCard>
  );
}

