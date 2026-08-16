/**
 * Canonical parsing for rpc_import_payments execute results.
 *
 * RPC row contract (20260816120000+):
 *   { rowId, status: "ok" | "failed", payment_id, error }
 *
 * Top-level response:
 *   { ok, dry_run, rows_received, inserted, skipped, errors, results: [...] }
 */

export type PaymentImportExecuteRowResult = {
  payment_id: string | null;
  status: "ok" | "failed";
  error_message: string | null;
};

export function extractRpcImportPaymentsResults(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const envelope = data as { results?: unknown[]; preview?: unknown[] };
    if (Array.isArray(envelope.results)) return envelope.results;
    if (Array.isArray(envelope.preview)) return envelope.preview;
  }
  return [];
}

export function parseRpcPaymentImportRowResult(
  result: Record<string, unknown>
): PaymentImportExecuteRowResult {
  const payment_id = (result.payment_id as string | null | undefined) ?? null;
  const error_message =
    (result.error as string | null | undefined) ??
    (result.error_message as string | null | undefined) ??
    null;

  if (typeof result.status === "string") {
    return {
      payment_id,
      status: result.status.toLowerCase() === "ok" ? "ok" : "failed",
      error_message,
    };
  }

  const action = String(result.action ?? "").toUpperCase();
  if (action === "INSERT" || action === "UPDATE" || action === "SKIP") {
    return { payment_id, status: "ok", error_message };
  }

  if (action === "FAIL" || action === "FAILED") {
    return { payment_id: null, status: "failed", error_message };
  }

  if (payment_id && !error_message) {
    return { payment_id, status: "ok", error_message: null };
  }

  return {
    payment_id,
    status: "failed",
    error_message: error_message ?? "Unknown import result",
  };
}

export function resolvePaymentImportResultRowId(params: {
  result: Record<string, unknown>;
  previewRows: Array<{ rowId: string; rowIndex: number }>;
  processedRows: Array<{ rowId: string; rowIndex: number }>;
}): string | null {
  const { result, previewRows, processedRows } = params;

  if (typeof result.rowId === "string" && result.rowId) {
    return result.rowId;
  }

  if (result.row_id !== undefined && result.row_id !== null) {
    const parsed = Number.parseInt(String(result.row_id), 10);
    if (Number.isFinite(parsed)) {
      const matched = previewRows.find((row) => row.rowIndex === parsed);
      if (matched) return matched.rowId;
    }
  }

  if (typeof result.row === "number") {
    const matched = processedRows[result.row - 1];
    if (matched) return matched.rowId;
  }

  return null;
}

export function mapRpcPaymentImportResults(params: {
  rpcData: unknown;
  previewRows: Array<{ rowId: string; rowIndex: number; action: string }>;
  processedRows: Array<{ rowId: string; rowIndex: number; action: string }>;
}): Map<string, PaymentImportExecuteRowResult> {
  const resultMap = new Map<string, PaymentImportExecuteRowResult>();

  for (const raw of extractRpcImportPaymentsResults(params.rpcData)) {
    if (!raw || typeof raw !== "object") continue;
    const record = raw as Record<string, unknown>;
    const rowId = resolvePaymentImportResultRowId({
      result: record,
      previewRows: params.previewRows,
      processedRows: params.processedRows,
    });
    if (!rowId) continue;
    resultMap.set(rowId, parseRpcPaymentImportRowResult(record));
  }

  return resultMap;
}
