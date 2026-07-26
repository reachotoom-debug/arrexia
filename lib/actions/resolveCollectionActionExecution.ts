import type { ReminderActionContext } from "./types";

export type RuleBoundCollectionActionExecution = {
  mode: "rule_bound";
  ruleId: string;
  templateId: string | null;
  scheduledDate: string;
  clientEmail: string;
};

export type ManualCollectionActionExecution = {
  mode: "manual";
  clientEmail: string;
};

export type ViewOnlyCollectionActionExecution = {
  mode: "view_only";
};

export type CollectionActionExecution =
  | RuleBoundCollectionActionExecution
  | ManualCollectionActionExecution
  | ViewOnlyCollectionActionExecution;

export function resolveCollectionActionExecution(params: {
  hasReminderDue: boolean;
  reminderAction?: ReminderActionContext;
  clientEmail: string | null;
}): CollectionActionExecution {
  const { hasReminderDue, reminderAction, clientEmail } = params;

  if (hasReminderDue && reminderAction) {
    const email = reminderAction.clientEmail?.trim();
    if (!email) {
      return { mode: "view_only" };
    }

    return {
      mode: "rule_bound",
      ruleId: reminderAction.ruleId,
      templateId: reminderAction.templateId,
      scheduledDate: reminderAction.scheduledDate,
      clientEmail: email,
    };
  }

  const normalizedEmail = clientEmail?.trim();
  if (normalizedEmail) {
    return {
      mode: "manual",
      clientEmail: normalizedEmail,
    };
  }

  return { mode: "view_only" };
}
