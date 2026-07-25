"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ReminderRuleSchema,
  type ReminderRuleInput,
} from "@/lib/reminders/schema";
import {
  NO_REMINDER_TEMPLATES_MESSAGE,
  REMINDER_RULE_FOR_STATUS_UI_OPTIONS,
} from "@/lib/reminders/canonicalDefaults";
import {
  createReminderRule,
  updateReminderRule,
  deleteReminderRule,
} from "../actions";
import { useToast } from "@/components/ui/use-toast";
import { AlertDialog } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Pencil, Trash2 } from "lucide-react";
import type { Database } from "@/types/supabase/index";

type ReminderRuleRow = Database["public"]["Tables"]["reminder_rules"]["Row"];
type ReminderTemplateRow = Database["public"]["Tables"]["reminder_templates"]["Row"];

/** Normalized timing identity for duplicate checks (aligns form values with DB / legacy rows). */
type TimingFingerprint = {
  triggerType: string;
  offsetDays: number;
  forStatus: string | null;
};

function fingerprintFromSubmit(
  data: Pick<ReminderRuleInput, "triggerType" | "offsetDays" | "forStatus">
): TimingFingerprint {
  return {
    triggerType: data.triggerType,
    offsetDays:
      data.triggerType === "on_due" ? 0 : Number(data.offsetDays ?? 0),
    forStatus: data.forStatus ?? null,
  };
}

function fingerprintFromDbRow(r: {
  trigger_type: string;
  offset_days: number | null;
  for_status: string | null;
}): TimingFingerprint {
  const offset = r.offset_days ?? 0;
  const forStatus = r.for_status ?? null;

  if (r.trigger_type === "relative_to_due_date") {
    if (offset < 0) {
      return {
        triggerType: "before_due",
        offsetDays: Math.abs(offset),
        forStatus,
      };
    }
    if (offset === 0) {
      return { triggerType: "on_due", offsetDays: 0, forStatus };
    }
    return { triggerType: "after_due", offsetDays: offset, forStatus };
  }

  if (r.trigger_type === "on_due") {
    return { triggerType: "on_due", offsetDays: 0, forStatus };
  }
  if (r.trigger_type === "before_due") {
    return {
      triggerType: "before_due",
      offsetDays: Math.abs(offset),
      forStatus,
    };
  }
  if (r.trigger_type === "after_due") {
    return {
      triggerType: "after_due",
      offsetDays: Math.abs(offset),
      forStatus,
    };
  }

  return {
    triggerType: r.trigger_type,
    offsetDays: offset,
    forStatus,
  };
}

function fingerprintsEqual(a: TimingFingerprint, b: TimingFingerprint): boolean {
  return (
    a.triggerType === b.triggerType &&
    a.offsetDays === b.offsetDays &&
    a.forStatus === b.forStatus
  );
}

function isDuplicateTiming(
  submit: Pick<ReminderRuleInput, "triggerType" | "offsetDays" | "forStatus">,
  existingRules: Array<{
    id: string;
    trigger_type: string;
    offset_days: number | null;
    for_status: string | null;
  }>,
  editingRuleId?: string
): boolean {
  const fp = fingerprintFromSubmit(submit);
  return existingRules.some((r) => {
    if (editingRuleId && r.id === editingRuleId) return false;
    return fingerprintsEqual(fp, fingerprintFromDbRow(r));
  });
}

interface ReminderRuleFormProps {
  workspaceId: string;
  rule?: ReminderRuleRow;
  templates: ReminderTemplateRow[];
  /** Used to block creating/editing into a timing that already exists. */
  existingRules: ReminderRuleRow[];
  iconOnly?: boolean;
  onGoToTemplates?: () => void;
}

export function ReminderRuleForm({
  workspaceId,
  rule,
  templates,
  existingRules,
  iconOnly = false,
  onGoToTemplates,
}: ReminderRuleFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [duplicateTimingError, setDuplicateTimingError] = useState<string | null>(
    null
  );

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ReminderRuleInput>({
    resolver: zodResolver(ReminderRuleSchema) as any,
    defaultValues: rule
        ? {
            name: rule.name || "",
            triggerType: (rule.trigger_type as "before_due" | "on_due" | "after_due") || "after_due",
            offsetDays: rule.trigger_type === "on_due" ? 0 : (rule.offset_days || 7),
            forStatus: (rule.for_status as "any" | "sent" | "partially_paid" | "overdue" | "draft") || "any",
            templateId: rule.template_id,
            isEnabled: rule.is_enabled ?? true,
          }
      : {
          name: "",
          triggerType: "after_due",
          offsetDays: 7,
          forStatus: "any",
          templateId: templates[0]?.id || "",
          isEnabled: true,
        },
  });

  const triggerType = watch("triggerType");
  const offsetDaysW = watch("offsetDays");
  const forStatusW = watch("forStatus");
  const isLegacyDraftRule = rule?.for_status === "draft";

  // Auto-set offsetDays to 0 when triggerType is "on_due"
  useEffect(() => {
    if (triggerType === "on_due") {
      setValue("offsetDays", 0);
    }
  }, [triggerType, setValue]);

  useEffect(() => {
    setDuplicateTimingError(null);
  }, [triggerType, offsetDaysW, forStatusW]);

  const onSubmit = async (data: ReminderRuleInput) => {
    try {
      // Ensure offsetDays is 0 for on_due trigger type
      const submitData = {
        ...data,
        offsetDays: data.triggerType === "on_due" ? 0 : data.offsetDays,
      };

      if (
        isDuplicateTiming(
          submitData,
          existingRules,
          rule?.id
        )
      ) {
        setDuplicateTimingError("A rule already exists for this timing");
        return;
      }
      setDuplicateTimingError(null);

      let result;
      if (rule) {
        result = await updateReminderRule(workspaceId, rule.id, submitData);
      } else {
        result = await createReminderRule(workspaceId, submitData);
      }

      if (result.success) {
        router.refresh();
        setIsOpen(false);
        reset();
        toast({
          title: "Settings saved",
          description: rule
            ? "Rule updated successfully"
            : "Rule created successfully",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.error || "Failed to save rule",
        });
      }
    } catch (error) {
      console.error("[ReminderRuleForm] submit error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "An error occurred while saving the rule",
      });
    }
  };

  const handleDeleteClick = () => {
    if (!rule) return;
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!rule) return;
    setIsDeleting(true);
    try {
      const result = await deleteReminderRule(workspaceId, rule.id);
      if (result.success) {
        router.refresh();
        setIsOpen(false);
        toast({
          title: "Rule deleted",
          description: "Rule deleted successfully",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.error || "Failed to delete rule",
        });
      }
    } catch (error) {
      console.error("[ReminderRuleForm] delete error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "An error occurred while deleting the rule",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (!isOpen) {
    if (!rule && templates.length === 0) {
      return (
        <div className="flex max-w-sm flex-col items-end gap-2 text-right">
          <p className="text-xs text-amber-800">{NO_REMINDER_TEMPLATES_MESSAGE}</p>
          {onGoToTemplates ? (
            <button
              type="button"
              onClick={onGoToTemplates}
              className="inline-flex items-center rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-950 transition-colors hover:bg-amber-100"
            >
              Go to Templates
            </button>
          ) : null}
        </div>
      );
    }
    return (
      rule && iconOnly ? (
        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={() => {
            setDuplicateTimingError(null);
            setIsOpen(true);
          }}
          aria-label={`Edit reminder rule ${rule.name}`}
          title={`Edit reminder rule ${rule.name}`}
          className="h-8 w-8"
        >
          <Pencil className="h-4 w-4" />
        </Button>
      ) : (
        <button
          onClick={() => {
            setDuplicateTimingError(null);
            setIsOpen(true);
          }}
          className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-blue-700"
        >
          {rule ? "Edit" : "+ New Rule"}
        </button>
      )
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white text-left shadow-lg">
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <h3 className="text-lg font-semibold text-slate-900">
            {rule ? "Edit Rule" : "New Rule"}
          </h3>
          <button
            type="button"
            onClick={() => {
              setIsOpen(false);
              setDuplicateTimingError(null);
              reset();
            }}
            aria-label="Close"
            className="shrink-0 text-slate-400 hover:text-slate-600"
          >
            ✕
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          <form onSubmit={handleSubmit(onSubmit as any)} className="space-y-4">
            <div className="space-y-1.5">
              <label
                htmlFor="reminder-rule-name"
                className="block text-left text-sm font-medium text-slate-700"
              >
                Name <span aria-hidden="true">*</span>
              </label>
              <input
                id="reminder-rule-name"
                {...register("name")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-600"
                placeholder="e.g., 7 Days After Due"
              />
              {errors.name && (
                <p className="mt-1 text-left text-xs text-red-600">{errors.name.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="reminder-rule-trigger-type"
                className="block text-left text-sm font-medium text-slate-700"
              >
                Trigger Type <span aria-hidden="true">*</span>
              </label>
              <select
                id="reminder-rule-trigger-type"
                {...register("triggerType")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-600"
              >
                <option value="before_due">Before due date</option>
                <option value="on_due">On due date</option>
                <option value="after_due">After due date</option>
              </select>
            </div>

            {watch("triggerType") !== "on_due" && (
              <div className="space-y-1.5">
                <label
                  htmlFor="reminder-rule-offset-days"
                  className="block text-left text-sm font-medium text-slate-700"
                >
                  Offset Days <span aria-hidden="true">*</span>
                </label>
                <input
                  id="reminder-rule-offset-days"
                  type="number"
                  {...register("offsetDays", { valueAsNumber: true })}
                  min="0"
                  max="365"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-600"
                />
                <p className="mt-1 text-left text-xs text-slate-500">
                  Number of days {watch("triggerType") === "before_due" ? "before" : "after"} the
                  due date
                </p>
                {errors.offsetDays && (
                  <p className="mt-1 text-left text-xs text-red-600">
                    {errors.offsetDays.message}
                  </p>
                )}
              </div>
            )}

            <div className="space-y-1.5">
              <label
                htmlFor="reminder-rule-for-status"
                className="block text-left text-sm font-medium text-slate-700"
              >
                Applies To <span aria-hidden="true">*</span>
              </label>
              {isLegacyDraftRule ? (
                <>
                  <input type="hidden" {...register("forStatus")} />
                  <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm text-slate-700">
                    Draft (legacy rule)
                  </p>
                  <label
                    htmlFor="reminder-rule-for-status-update"
                    className="block text-left text-xs font-medium text-slate-600"
                  >
                    Update applies to
                  </label>
                  <select
                    id="reminder-rule-for-status-update"
                    defaultValue=""
                    onChange={(event) => {
                      const value = event.target.value;
                      if (!value) return;
                      setValue(
                        "forStatus",
                        value as ReminderRuleInput["forStatus"]
                      );
                    }}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-600"
                  >
                    <option value="">Keep Draft (legacy)</option>
                    {REMINDER_RULE_FOR_STATUS_UI_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <select
                  id="reminder-rule-for-status"
                  {...register("forStatus")}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-600"
                >
                  {REMINDER_RULE_FOR_STATUS_UI_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              )}
              <p className="mt-1 text-left text-xs text-slate-500">
                Which invoice statuses this rule applies to
              </p>
            </div>

            <div className="space-y-1.5">
              <label
                htmlFor="reminder-rule-template"
                className="block text-left text-sm font-medium text-slate-700"
              >
                Template <span aria-hidden="true">*</span>
              </label>
              {templates.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-left text-sm text-amber-800">
                  No templates available. Please create a template first.
                </div>
              ) : (
                <select
                  id="reminder-rule-template"
                  {...register("templateId")}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-600"
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              )}
              {errors.templateId && (
                <p className="mt-1 text-left text-xs text-red-600">
                  {errors.templateId.message}
                </p>
              )}
            </div>

            <div>
              <label className="flex items-center gap-2 text-left">
                <input
                  type="checkbox"
                  {...register("isEnabled")}
                  className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                />
                <span className="text-sm text-slate-700">Enabled</span>
              </label>
            </div>

            {duplicateTimingError && (
              <p className="text-left text-sm text-red-600" role="alert">
                {duplicateTimingError}
              </p>
            )}

            <div className="flex items-center justify-between border-t border-slate-200 pt-4">
              <div>
                {rule && (
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleDeleteClick}
                    disabled={isDeleting}
                    aria-label={`Delete reminder rule ${rule.name}`}
                    title={`Delete reminder rule ${rule.name}`}
                    className="h-8 w-8 text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    setDuplicateTimingError(null);
                    reset();
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || templates.length === 0}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSubmitting ? "Saving..." : rule ? "Update" : "Create"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {rule && (
        <AlertDialog
          open={showDeleteConfirm}
          onOpenChange={setShowDeleteConfirm}
          title="Delete Rule"
          description={`Are you sure you want to delete "${rule.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={handleDeleteConfirm}
          variant="destructive"
        />
      )}
    </div>
  );
}
