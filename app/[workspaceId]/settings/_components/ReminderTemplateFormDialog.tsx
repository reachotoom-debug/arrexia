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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Mode = "create" | "edit";

interface ReminderTemplateFormDialogProps {
  mode: Mode;
  workspaceId: string;
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
    resolver: zodResolver(ReminderTemplateSchema),
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
        <Button variant={mode === "create" ? "default" : "outline"} size="sm">
          {mode === "create" ? "New template" : "Edit"}
        </Button>
      </DialogTrigger>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {mode === "create" ? "New reminder template" : "Edit reminder template"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
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
            <textarea
              {...register("description")}
              rows={2}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
              placeholder="Optional description"
            />
            {errors.description && (
              <p className="mt-1 text-xs text-red-600">{errors.description.message}</p>
            )}
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
            {errors.channel && (
              <p className="mt-1 text-xs text-red-600">{errors.channel.message}</p>
            )}
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

          <div className="space-y-2">
            <label className="flex items-center">
              <input
                type="checkbox"
                {...register("isEnabled")}
                className="mr-2 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
              />
              <span className="text-sm text-slate-700">Enabled</span>
            </label>

            <label className="flex items-center">
              <input
                type="checkbox"
                {...register("isDefault")}
                className="mr-2 rounded border-slate-300 text-blue-600 focus:ring-blue-600"
              />
              <span className="text-sm text-slate-700">Default for this channel</span>
            </label>
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-slate-200">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setIsOpen(false);
                reset();
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : mode === "create" ? "Create" : "Update"}
            </Button>
          </div>
        </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
