"use client";

import { createPortal } from "react-dom";
import ReminderForm from "./reminder-form";
import { type ReminderFormValues } from "@/lib/schemas/reminder";

interface ReminderModalProps {
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
  initialValues?: Partial<ReminderFormValues>;
  onSubmit: (values: ReminderFormValues) => Promise<void>;
}

export default function ReminderModal({
  workspaceId,
  isOpen,
  onClose,
  initialValues,
  onSubmit,
}: ReminderModalProps) {
  if (!isOpen) return null;

  const handleSubmit = async (values: ReminderFormValues) => {
    await onSubmit(values);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-slate-900">
            {initialValues ? "Edit Reminder Rule" : "Add Reminder Rule"}
          </h2>
        </div>
        <ReminderForm
          workspaceId={workspaceId}
          initialValues={initialValues}
          onSubmit={handleSubmit}
          onCancel={onClose}
        />
      </div>
    </div>,
    document.body
  );
}

