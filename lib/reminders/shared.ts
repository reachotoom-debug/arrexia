/**
 * Client-safe reminder helpers (no server-only modules, DB, or next/headers).
 */

/**
 * Format "When" text for a rule based on trigger_type and offset_days
 */
export function formatRuleWhenText(triggerType: string, offsetDays: number): string {
  if (triggerType === "before_due") {
    return `${offsetDays} day${offsetDays !== 1 ? "s" : ""} before due date`;
  }
  if (triggerType === "on_due") {
    return "On due date";
  }
  if (triggerType === "after_due") {
    return `${offsetDays} day${offsetDays !== 1 ? "s" : ""} after due date`;
  }
  // Legacy seed/migrations used this instead of before_due / after_due (signed offset_days).
  if (triggerType === "relative_to_due_date") {
    if (offsetDays === 0) return "On due date";
    const abs = Math.abs(offsetDays);
    const unit = abs === 1 ? "day" : "days";
    if (offsetDays < 0) return `${abs} ${unit} before due date`;
    return `${abs} ${unit} after due date`;
  }
  // Unknown label: still describe timing without leaking raw enum values.
  if (offsetDays === 0) return "On due date";
  const abs = Math.abs(offsetDays);
  const unit = abs === 1 ? "day" : "days";
  if (offsetDays < 0) return `${abs} ${unit} before due date`;
  return `${abs} ${unit} after due date`;
}
