export type WorkspaceOnboardingSignals = {
  /** Any non-archived invoice in the workspace. */
  invoiceCount: number;
  /** Invoices marked sent (operational receivables may exist). */
  sentInvoiceCount: number;
};

export function isWorkspaceFirstRun(signals: WorkspaceOnboardingSignals): boolean {
  return signals.invoiceCount === 0;
}

/** True when collections/actions workflows have never had sent invoices to track. */
export function hasNeverEnteredCollectionsWorkflow(
  signals: WorkspaceOnboardingSignals
): boolean {
  return signals.sentInvoiceCount === 0;
}

export const FIRST_RUN_DASHBOARD_INSIGHT = {
  level: "neutral" as const,
  title: "Welcome — set up your first receivable.",
  detail:
    "Create a client, create an invoice, then send it to begin tracking collections and follow-up.",
};

export const FIRST_RUN_ACTIONS_EMPTY = {
  title: "No collection actions yet.",
  message:
    "Create a client, create an invoice, and send it when ready. Sent invoices enter your collections workflow.",
};

export const FIRST_RUN_COLLECTIONS_EMPTY = {
  title: "No overdue receivables yet.",
  message:
    "Collections tracks sent invoices with outstanding balances. Create a client, create an invoice, and send it to get started.",
  actionLabel: "Create invoice",
};

export const CAUGHT_UP_ACTIONS_EMPTY = {
  title: "Nothing needs immediate attention today.",
  message: "Your collections queue is up to date.",
};

export const CAUGHT_UP_COLLECTIONS_EMPTY = {
  title: "All caught up.",
  message: "All your invoices are up to date. Great job!",
  actionLabel: "View invoices",
};
