export type PaymentRevalidationTargets = {
  invoiceId?: string | null;
  clientId?: string | null;
  paymentId?: string | null;
};

export function revalidateFinancialSurfacesAfterPayment(
  workspaceId: string,
  revalidatePathFn: (path: string) => void,
  targets: PaymentRevalidationTargets = {}
): void {
  revalidatePathFn(`/${workspaceId}/dashboard`);
  revalidatePathFn(`/${workspaceId}/actions`);
  revalidatePathFn(`/${workspaceId}/collections`);
  revalidatePathFn(`/${workspaceId}/clients`);
  revalidatePathFn(`/${workspaceId}/invoices`);
  revalidatePathFn(`/${workspaceId}/payments`);

  if (targets.invoiceId) {
    revalidatePathFn(`/${workspaceId}/invoices/${targets.invoiceId}`);
  }
  if (targets.clientId) {
    revalidatePathFn(`/${workspaceId}/clients/${targets.clientId}`);
  }
  if (targets.paymentId) {
    revalidatePathFn(`/${workspaceId}/payments/${targets.paymentId}`);
  }
}
