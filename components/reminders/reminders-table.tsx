"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import ReminderModal from "./reminder-modal";
import { createReminder, updateReminder, deleteReminder } from "@/app/[workspaceId]/reminders/actions";
import { type ReminderFormValues } from "@/lib/schemas/reminder";

interface Reminder {
  id: string;
  name: string;
  type: string;
  offset_days: number;
  channel: string;
  active: boolean;
}

interface RemindersTableProps {
  reminders: Reminder[];
  workspaceId: string;
}

export default function RemindersTable({
  reminders,
  workspaceId,
}: RemindersTableProps) {
  const router = useRouter();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReminder, setEditingReminder] = useState<Reminder | null>(null);

  const handleSubmit = async (values: ReminderFormValues) => {
    if (editingReminder) {
      await updateReminder(workspaceId, editingReminder.id, values);
    } else {
      await createReminder(workspaceId, values);
    }
    setIsModalOpen(false);
    setEditingReminder(null);
    router.refresh();
  };

  const handleDelete = async (reminderId: string) => {
    if (confirm("Are you sure you want to delete this reminder rule?")) {
      await deleteReminder(workspaceId, reminderId);
      router.refresh();
    }
  };

  return (
    <>
      <div className="flex justify-end mb-4">
        <button
          onClick={() => {
            setEditingReminder(null);
            setIsModalOpen(true);
          }}
          className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 transition-colors"
        >
          Add Rule
        </button>
      </div>

      {reminders.length === 0 ? (
        <div className="rounded-xl bg-white p-12 text-center border border-slate-200">
          <p className="text-slate-600">No reminder rules found</p>
        </div>
      ) : (
        <div className="rounded-xl bg-white border border-slate-200 overflow-hidden">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Name
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Offset (days)
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Channel
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Active
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {reminders.map((reminder) => (
                <tr key={reminder.id} className="hover:bg-slate-50">
                  <td className="px-6 py-4 whitespace-nowrap font-medium text-slate-900">
                    {reminder.name}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                    {reminder.type}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                    {reminder.offset_days}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                    {reminder.channel}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${
                        reminder.active
                          ? "bg-green-100 text-green-800"
                          : "bg-slate-100 text-slate-800"
                      }`}
                    >
                      {reminder.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingReminder(reminder);
                          setIsModalOpen(true);
                        }}
                        className="text-slate-900 hover:text-slate-700"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(reminder.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ReminderModal
        workspaceId={workspaceId}
        isOpen={isModalOpen || !!editingReminder}
        onClose={() => {
          setIsModalOpen(false);
          setEditingReminder(null);
        }}
        initialValues={editingReminder ? {
          name: editingReminder.name,
          type: editingReminder.type as "before_due" | "after_due" | "on_due",
          offset_days: editingReminder.offset_days,
          channel: editingReminder.channel as "email" | "whatsapp" | "sms",
          active: editingReminder.active,
        } : undefined}
        onSubmit={handleSubmit}
      />
    </>
  );
}

