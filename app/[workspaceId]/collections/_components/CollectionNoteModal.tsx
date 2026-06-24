"use client";

import { useState, useEffect } from "react";

interface CollectionNoteModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (note: string | null) => Promise<void>;
  invoiceNumber: string | null;
  clientName: string | null;
  initialNote: string | null;
}

export function CollectionNoteModal({
  isOpen,
  onClose,
  onSave,
  invoiceNumber,
  clientName,
  initialNote,
}: CollectionNoteModalProps) {
  const [note, setNote] = useState(initialNote ?? "");
  const [isPending, setIsPending] = useState(false);

  // Update note when initialNote changes
  useEffect(() => {
    setNote(initialNote ?? "");
  }, [initialNote]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPending(true);
    try {
      await onSave(note.trim() || null);
    } finally {
      setIsPending(false);
    }
  };

  const handleClose = () => {
    if (!isPending) {
      setNote(initialNote ?? "");
      onClose();
    }
  };

  if (!isOpen) return null;

  const subtitleParts = [invoiceNumber, clientName].filter(Boolean);
  const subtitle = subtitleParts.length > 0 ? subtitleParts.join(" • ") : undefined;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white shadow-lg">
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="text-sm font-semibold text-slate-900">Collection note</h3>
          {subtitle && (
            <p className="text-xs text-slate-500 mt-1">{subtitle}</p>
          )}
        </div>
        <form onSubmit={handleSubmit}>
          <div className="p-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">
              Note
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent resize-none"
              placeholder="Add collections notes about follow-up, client communication, etc."
              maxLength={2000}
              disabled={isPending}
            />
            <p className="mt-1 text-xs text-slate-500">
              {note.length}/2000 characters
            </p>
          </div>
          <div className="flex gap-2 border-t border-slate-200 px-4 py-3">
            <button
              type="button"
              onClick={handleClose}
              className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60 disabled:cursor-not-allowed"
              disabled={isPending}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isPending ? "Saving..." : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

