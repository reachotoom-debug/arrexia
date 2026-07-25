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
} from "../actions";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";

type Mode = "create" | "edit";

interface ReminderTemplateFormDialogProps {
  mode: Mode;
  workspaceId: string;
  iconOnly?: boolean;
  template?: {
    id: string;
    name: string;
    description: string | null;
    channel: "email" | "whatsapp";
    subject: string;
    body: string;
    isEnabled: boolean;
    isDefault: boolean;
  };
}

export function ReminderTemplateFormDialog({
  mode,
  workspaceId,
  iconOnly = false,
  template,
}: ReminderTemplateFormDialogProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isOpen, setIsOpen] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<ReminderTemplateInput>({
    resolver: zodResolver(ReminderTemplateSchema) as any,
    defaultValues: template
      ? {
          name: template.name,
          description: template.description || "",
          channel: template.channel || "email",
          subject: template.subject,
          body: template.body,
          isEnabled: template.isEnabled ?? true,
          isDefault: template.isDefault ?? false,
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

  const closeDialog = () => {
    setIsOpen(false);
    reset();
  };

  const onSubmit = async (data: ReminderTemplateInput) => {
    try {
      let result;
      if (mode === "edit" && template) {
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
          description: "Template saved",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.error || "Failed to save template",
        });
      }
    } catch (error) {
      console.error("[ReminderTemplateFormDialog] submit error:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "An error occurred while saving the template",
      });
    }
  };

  return (
    <>
      <DialogTrigger asChild onClick={() => setIsOpen(true)}>
        {mode === "edit" && iconOnly && template ? (
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label={`Edit reminder template ${template.name}`}
            title={`Edit reminder template ${template.name}`}
            className="h-8 w-8"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        ) : (
          <Button variant={mode === "create" ? "default" : "outline"} size="sm">
            {mode === "create" ? "New template" : "Edit"}
          </Button>
        )}
      </DialogTrigger>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden text-left">
          <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <DialogTitle>
              {mode === "create" ? "New reminder template" : "Edit reminder template"}
            </DialogTitle>
            <button
              type="button"
              onClick={closeDialog}
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
                  htmlFor="reminder-template-name"
                  className="block text-left text-sm font-medium text-slate-700"
                >
                  Name <span aria-hidden="true">*</span>
                </label>
                <input
                  id="reminder-template-name"
                  {...register("name")}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-600"
                  placeholder="e.g., Friendly Reminder"
                />
                {errors.name && (
                  <p className="mt-1 text-left text-xs text-red-600">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="reminder-template-description"
                  className="block text-left text-sm font-medium text-slate-700"
                >
                  Description
                </label>
                <textarea
                  id="reminder-template-description"
                  {...register("description")}
                  rows={2}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-600"
                  placeholder="Optional description"
                />
                {errors.description && (
                  <p className="mt-1 text-left text-xs text-red-600">
                    {errors.description.message}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="reminder-template-channel"
                  className="block text-left text-sm font-medium text-slate-700"
                >
                  Channel <span aria-hidden="true">*</span>
                </label>
                <select
                  id="reminder-template-channel"
                  {...register("channel")}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-600"
                >
                  <option value="email">Email</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
                {errors.channel && (
                  <p className="mt-1 text-left text-xs text-red-600">{errors.channel.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="reminder-template-subject"
                  className="block text-left text-sm font-medium text-slate-700"
                >
                  Subject <span aria-hidden="true">*</span>
                </label>
                <input
                  id="reminder-template-subject"
                  {...register("subject")}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-600"
                  placeholder="e.g., Reminder: Invoice {{invoice_number}}"
                />
                {errors.subject && (
                  <p className="mt-1 text-left text-xs text-red-600">{errors.subject.message}</p>
                )}
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="reminder-template-body"
                  className="block text-left text-sm font-medium text-slate-700"
                >
                  Body <span aria-hidden="true">*</span>
                </label>
                <textarea
                  id="reminder-template-body"
                  {...register("body")}
                  rows={6}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-600"
                  placeholder="Email body text..."
                />
                <p className="mt-1 text-left text-xs text-slate-500">
                  Variables: {`{{client_name}}`}, {`{{invoice_number}}`}, {`{{amount_due}}`},{" "}
                  {`{{due_date}}`}, {`{{workspace_name}}`}
                </p>
                {errors.body && (
                  <p className="mt-1 text-left text-xs text-red-600">{errors.body.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 text-left">
                  <input
                    type="checkbox"
                    {...register("isEnabled")}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  <span className="text-sm text-slate-700">Enabled</span>
                </label>

                <label className="flex items-center gap-2 text-left">
                  <input
                    type="checkbox"
                    {...register("isDefault")}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-600"
                  />
                  <span className="text-sm text-slate-700">Default for this channel</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-4">
                <Button type="button" variant="outline" onClick={closeDialog}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSubmitting}>
                  {isSubmitting ? "Saving..." : mode === "create" ? "Create" : "Update"}
                </Button>
              </div>
            </form>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
