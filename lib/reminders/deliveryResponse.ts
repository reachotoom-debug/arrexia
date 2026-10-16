/** Preserve reconciliation guidance at every HTTP adapter boundary. */
export function reminderDeliveryResponse(result: {
  historyPersisted?: boolean; deliveryUncertain?: boolean; errorMessage?: string; message?: string;
  status: "sent" | "failed" | "skipped"; reminderId?: string; reminderLogId?: string;
}) {
  const reconcile = result.deliveryUncertain || result.historyPersisted === false;
  const message = result.errorMessage || result.message;
  return {
    status: result.status,
    reminderId: result.reminderId,
    reminder_log_id: result.reminderLogId ?? result.reminderId,
    historyPersisted: result.historyPersisted,
    deliveryUncertain: result.deliveryUncertain,
    reconciliationRequired: Boolean(reconcile),
    // A claimed attempt must never be replayed automatically, even if its
    // provider response was an error. A later attempt needs human review.
    retryAllowed: false,
    ...(reconcile ? { message: `${message || "Reminder delivery needs review"}. Reconcile delivery and history; do not resend.` } : {}),
  };
}
