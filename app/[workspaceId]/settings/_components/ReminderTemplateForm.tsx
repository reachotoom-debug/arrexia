"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  ReminderTemplateSchema,
  type ReminderTemplateInput,
} from "@/lib/reminders/schema";
import {
  createReminderTemplate,
  updateReminderTemplate,
  deleteReminderTemplate,
} from "../actions";
import { useToast } from "@/components/ui/use-toast";
import { AlertDialog } from "@/components/ui/alert-dialog";
import type { Database } from "@/types/supabase";

type ReminderTemplateRow = Database["public"]["Tables"]["reminder_templates"]["Row"];

interface ReminderTemplateFormProps {
  workspaceId: string;
  template?: ReminderTemplateRow;
}

export function ReminderTemplateForm({
  workspaceId,
  template,
}: ReminderTemplateFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ReminderTemplateInput>({
    resolver: zodResolver(ReminderTemplateSchema),
    defaultValues: template
      ? {
          name: template.name,
          description: template.description ?? undefined,
          channel: (template.channel as "email" | "whatsapp") || "email",
          subject: template.subject,
          body: template.body,
          isEnabled: template.is_enabled ?? true,
          isDefault: template.is_default ?? false,
        }
      : {
          name: "",
          description: "",
          channel: "email",
          subject: "",
          body: "",
          isEnabled: true,
          isDefault: false,
        },
  });

  const onSubmit = async (data: ReminderTemplateInput) => {
    try {
      let result;
      if (template) {
        result = await updateReminderTemplate(workspaceId, template.id, data);
      } else {
        result = await createReminderTemplate(workspaceId, data);
      }

      if (result.success) {
        router.refresh();
        setIsOpen(false);
        reset();
        toast({
          title: "Success",
          description: template
            ? "Template updated successfully"
            : "Template created successfully",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.error || "Failed to save template",
        });
      }
    } catch (error) {
      console.error("[ReminderTemplateForm] submit error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "An error occurred while saving the template",
      });
    }
  };

  const handleDeleteClick = () => {
    if (!template) return;
    setShowDeleteConfirm(true);
  };

  const handleDeleteConfirm = async () => {
    if (!template) return;
    setIsDeleting(true);
    try {
      const result = await deleteReminderTemplate(workspaceId, template.id);
      if (result.success) {
        router.refresh();
        setIsOpen(false);
        toast({
          title: "Template deleted",
          description: "Template deleted successfully",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.error || "Failed to delete template",
        });
      }
    } catch (error) {
      console.error("[ReminderTemplateForm] delete error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "An error occurred while deleting the template",
      });
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="inline-flex items-center rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700 transition-colors"
      >
        {template ? "Edit" : "+ New Template"}
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-lg max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-slate-900">
              {template ? "Edit Template" : "New Template"}
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
                placeholder="e.g., Friendly Reminder"
              />
              {errors.name && (
                <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Description
              </label>
              <input
                {...register("description")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                placeholder="Optional description"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Channel *
              </label>
              <select
                {...register("channel")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              >
                <option value="email">Email</option>
                <option value="whatsapp">WhatsApp</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Subject *
              </label>
              <input
                {...register("subject")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                placeholder="e.g., Reminder: Invoice {{invoice_number}}"
              />
              {errors.subject && (
                <p className="mt-1 text-xs text-red-600">{errors.subject.message}</p>
              )}
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Body *
              </label>
              <textarea
                {...register("body")}
                rows={8}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
                placeholder="Email body text..."
              />
              <p className="mt-1 text-xs text-slate-500">
                Variables: {`{{client_name}}`}, {`{{invoice_number}}`}, {`{{amount_due}}`}, {`{{due_date}}`}, {`{{workspace_name}}`}
              </p>
              {errors.body && (
                <p className="mt-1 text-xs text-red-600">{errors.body.message}</p>
              )}
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center">
                <input
                  type="checkbox"
                  {...register("isEnabled")}
                  className="mr-2"
                />
                <span className="text-sm text-slate-700">Enabled</span>
              </label>

              <label className="flex items-center">
                <input
                  type="checkbox"
                  {...register("isDefault")}
                  className="mr-2"
                />
                <span className="text-sm text-slate-700">Default for this channel</span>
              </label>
            </div>
            <p className="text-xs text-slate-500">
              Only one template can be set as default per channel
            </p>

            <div className="flex items-center justify-between pt-4 border-t border-slate-200">
              <div>
                {template && (
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
                  disabled={isSubmitting}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "Saving..." : template ? "Update" : "Create"}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {template && (
        <AlertDialog
          open={showDeleteConfirm}
          onOpenChange={setShowDeleteConfirm}
          title="Delete Template"
          description={`Are you sure you want to delete "${template.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={handleDeleteConfirm}
          variant="destructive"
        />
      )}
    </div>
  );
}
