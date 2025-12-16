export type ListType = "invoices" | "clients" | "payments" | "dashboard";

export function getPrefsStorageKey(workspaceId: string, type: ListType): string {
  return `flowcollect:${workspaceId}:${type}:prefs`;
}

