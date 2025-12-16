"use client";

import { useState, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import type { Database } from "@/types/supabase";

type ReminderTemplate = Database["public"]["Tables"]["reminder_templates"]["Row"];

const templateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  subject: z.string().min(1, "Subject is required"),
  body: z.string().min(1, "Body is required"),
});

type TemplateFormValues = z.infer<typeof templateSchema>;

interface EditReminderTemplateModalProps {
  template: ReminderTemplate;
  onSave: (updates: { name: string; subject: string; body: string }) => Promise<void>;
  onClose: () => void;
}

const AVAILABLE_VARIABLES = [
  { name: "{{client_name}}", description: "Client's name" },
  { name: "{{invoice_number}}", description: "Invoice number" },
  { name: "{{amount_due}}", description: "Amount due" },
  { name: "{{due_date}}", description: "Due date" },
  { name: "{{days_overdue}}", description: "Days overdue" },
];

export default function EditReminderTemplateModal({
  template,
  onSave,
  onClose,
}: EditReminderTemplateModalProps) {
  const [isClosing, setIsClosing] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<TemplateFormValues>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      name: template.name || "Reminder",
      subject: template.subject,
      body: template.body,
    },
  });

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  }, [onClose]);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        handleClose();
      }
    };
    document.addEventListener("keydown", handleEscape);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleEscape);
      document.body.style.overflow = "unset";
    };
  }, [handleClose]);

  const onSubmit = async (values: TemplateFormValues) => {
    try {
      await onSave(values);
      // onSave will handle closing via router.refresh and the parent component
      handleClose();
    } catch {
      // Error handling is done in the parent component
      // Modal stays open on error
    }
  };

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm transition-opacity duration-200 ${
        isClosing ? "opacity-0" : "opacity-100"
      }`}
      onClick={handleClose}
    >
      <div
        className={`w-full max-w-2xl max-h-[90vh] rounded-xl bg-white shadow-xl transition-all duration-200 ${
          isClosing ? "scale-95 opacity-0" : "scale-100 opacity-100"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit(onSubmit)} className="flex flex-col h-full">
          {/* Header */}
          <div className="border-b border-slate-200 px-6 py-4">
            <h2 className="text-xl font-semibold text-slate-900">
              Edit Template
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Code: <span className="font-mono text-xs">{template.code}</span>
            </p>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-6">
            {/* Name (editable) */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Name *
              </label>
              <input
                type="text"
                {...register("name")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                placeholder="Reminder: upcoming due date"
              />
              {errors.name && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.name.message}
                </p>
              )}
              <p className="mt-1 text-xs text-slate-500">
                Human-readable name for this template
              </p>
            </div>

            {/* Subject */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Subject *
              </label>
              <input
                type="text"
                {...register("subject")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
                placeholder="Payment Reminder: Invoice {{invoice_number}}"
              />
              {errors.subject && (
                <p className="mt-1 text-xs text-red-600">
                  {errors.subject.message}
                </p>
              )}
            </div>

            {/* Body */}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Body *
              </label>
              <textarea
                {...register("body")}
                rows={12}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent font-mono"
                placeholder="Hi {{client_name}},&#10;&#10;This is a reminder..."
              />
              {errors.body && (
                <p className="mt-1 text-xs text-red-600">{errors.body.message}</p>
              )}
            </div>

            {/* Available Variables */}
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <h3 className="text-sm font-medium text-slate-900 mb-2">
                Available Variables
              </h3>
              <p className="text-xs text-slate-600 mb-3">
                Use these variables in your template. They will be replaced with actual
                values when sending reminders.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {AVAILABLE_VARIABLES.map((variable) => (
                  <div
                    key={variable.name}
                    className="flex items-center gap-2 text-xs"
                  >
                    <code className="bg-white border border-slate-200 px-2 py-1 rounded font-mono text-slate-900">
                      {variable.name}
                    </code>
                    <span className="text-slate-600">{variable.description}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="border-t border-slate-200 px-6 py-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {isSubmitting ? "Saving..." : "Save Template"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body
  );
}

