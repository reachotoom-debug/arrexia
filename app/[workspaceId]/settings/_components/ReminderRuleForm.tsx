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
  createReminderRule,
  updateReminderRule,
  deleteReminderRule,
} from "../actions";
import { useToast } from "@/components/ui/use-toast";
import { AlertDialog } from "@/components/ui/alert-dialog";
import type { Database } from "@/types/supabase";

type ReminderRuleRow = Database["public"]["Tables"]["reminder_rules"]["Row"];
type ReminderTemplateRow = Database["public"]["Tables"]["reminder_templates"]["Row"];

interface ReminderRuleFormProps {
  workspaceId: string;
  rule?: ReminderRuleRow;
  templates: ReminderTemplateRow[];
}

export function ReminderRuleForm({
  workspaceId,
  rule,
  templates,
}: ReminderRuleFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ReminderRuleInput>({
    resolver: zodResolver(ReminderRuleSchema),
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

  // Auto-set offsetDays to 0 when triggerType is "on_due"
  useEffect(() => {
    if (triggerType === "on_due") {
      setValue("offsetDays", 0);
    }
  }, [triggerType, setValue]);

  const onSubmit = async (data: ReminderRuleInput) => {
    try {
      // Ensure offsetDays is 0 for on_due trigger type
      const submitData = {
        ...data,
        offsetDays: data.triggerType === "on_due" ? 0 : data.offsetDays,
      };

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
        <button
          disabled
          className="inline-flex items-center rounded-lg bg-slate-300 px-3 py-1.5 text-xs font-medium text-white cursor-not-allowed"
          title="Create a template first"
        >
          + New Rule
        </button>
      );
    }
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
      >
        {rule ? "Edit" : "+ New Rule"}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">
              {rule ? "Edit Rule" : "New Rule"}
            </h3>
            <button
              onClick={() => {
                setIsOpen(false);
                reset();
              }}
              className="text-slate-400 hover:text-slate-600"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Name *
              </label>
              <input
                {...register("name")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                placeholder="e.g., 7 Days After Due"
              />
              {errors.name && (
                <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Trigger Type *
              </label>
              <select
                {...register("triggerType")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              >
                <option value="before_due">Before due date</option>
                <option value="on_due">On due date</option>
                <option value="after_due">After due date</option>
              </select>
            </div>

            {watch("triggerType") !== "on_due" && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">
                  Offset Days *
                </label>
                <input
                  type="number"
                  {...register("offsetDays", { valueAsNumber: true })}
                  min="0"
                  max="365"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                />
                <p className="mt-1 text-xs text-slate-500">
                  Number of days {watch("triggerType") === "before_due" ? "before" : "after"} the due date
                </p>
                {errors.offsetDays && (
                  <p className="mt-1 text-xs text-red-600">
                    {errors.offsetDays.message}
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Applies To *
              </label>
              <select
                {...register("forStatus")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              >
                <option value="any">Any status</option>
                <option value="sent">Sent only</option>
                <option value="partially_paid">Partially Paid</option>
                <option value="overdue">Overdue only</option>
                <option value="draft">Draft</option>
              </select>
              <p className="mt-1 text-xs text-slate-500">
                Which invoice statuses this rule applies to
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Template *
              </label>
              {templates.length === 0 ? (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  No templates available. Please create a template first.
                </div>
              ) : (
                <select
                  {...register("templateId")}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                >
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.name}
                    </option>
                  ))}
                </select>
              )}
              {errors.templateId && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.templateId.message}
                </p>
              )}
            </div>

            <div>
              <label className="flex items-center">
                <input
                  type="checkbox"
                  {...register("isEnabled")}
                  className="mr-2"
                />
                <span className="text-sm text-slate-700">Enabled</span>
              </label>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-200">
              <div>
                {rule && (
                  <button
                    type="button"
                    onClick={handleDeleteClick}
                    disabled={isDeleting}
                    className="text-sm text-red-600 hover:text-red-700 disabled:opacity-50"
                  >
                    {isDeleting ? "Deleting..." : "Delete"}
                  </button>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsOpen(false);
                    reset();
                  }}
                  className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting || templates.length === 0}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
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
