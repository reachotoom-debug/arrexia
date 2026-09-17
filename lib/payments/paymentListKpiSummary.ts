import { addKpiMoneyTotal, getKpiMoneyTotals, type KpiMoneyTotal } from "@/lib/format/kpiMoney";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Active payments with financially effective status (matches invoices_view paid semantics). */
export const FINANCIALLY_EFFECTIVE_PAYMENT_STATUS_OR =
  "status.eq.completed,status.eq.paid,status.is.null";

export type PaymentListKpiSummary = {
  totalPayments: number;
  totalAmountPaidByCurrency: KpiMoneyTotal[];
  uniqueClients: number;
  successRateLabel: string;
};

export function formatPaymentSuccessRate(
  successfulCount: number,
  totalCount: number
): string {
  if (totalCount <= 0) {
    return "0%";
  }

  const percent = (successfulCount / totalCount) * 100;
  return Number.isInteger(percent) ? `${percent}%` : `${percent.toFixed(1)}%`;
}

export function buildPaymentListKpiSummary(params: {
  totalPayments: number;
  totalAmountPaidByCurrency: KpiMoneyTotal[];
  uniqueClients: number;
  successfulPaymentCount: number;
}): PaymentListKpiSummary {
  return {
    totalPayments: params.totalPayments,
    totalAmountPaidByCurrency: params.totalAmountPaidByCurrency,
    uniqueClients: params.uniqueClients,
    successRateLabel: formatPaymentSuccessRate(
      params.successfulPaymentCount,
      params.totalPayments
    ),
  };
}

/** Reads every active payment, independently of ledger filters and pagination. */
export async function loadPaymentListKpiSummary(
  supabase: SupabaseClient,
  workspaceId: string
): Promise<PaymentListKpiSummary> {
  const pageSize = 1000;
  let totalPayments = 0;
  let successfulPaymentCount = 0;
  const amountTotals = new Map<string | null, number>();
  const clients = new Set<string>();

  for (let from = 0; ; from += pageSize) {
    const { data, error } = await supabase
      .from("payments_view")
      .select("amount, net_amount, status, client_id, currency")
      .eq("workspace_id", workspaceId)
      .is("archived_at", null)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;

    const rows = data ?? [];
    totalPayments += rows.length;
    for (const payment of rows) {
      if (payment.status === "completed" || payment.status === "paid" || payment.status === null) {
        const amount = Number(payment.net_amount ?? payment.amount ?? 0);
        if (!Number.isFinite(amount)) throw new Error("Invalid payment amount in KPI summary");
        addKpiMoneyTotal(amountTotals, amount, payment.currency);
        if (payment.client_id != null) clients.add(payment.client_id);
        successfulPaymentCount += 1;
      }
    }
    if (rows.length < pageSize) break;
  }

  return buildPaymentListKpiSummary({
    totalPayments,
    totalAmountPaidByCurrency: getKpiMoneyTotals(amountTotals),
    uniqueClients: clients.size,
    successfulPaymentCount,
  });
}
