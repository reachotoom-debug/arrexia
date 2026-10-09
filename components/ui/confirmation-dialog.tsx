"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";

/** Synchronous lock also prevents a second click before React renders disabled. */
export function createConfirmationSubmission() {
  let pending = false;
  return async (submit: () => Promise<void>) => {
    if (pending) return;
    pending = true;
    try {
      await submit();
    } finally {
      pending = false;
    }
  };
}

interface ConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  action: "archive" | "unarchive";
  recordName: string;
  count: number;
  onConfirm: () => Promise<void>;
}

export function ConfirmationDialog({ open, onOpenChange, action, recordName, count, onConfirm }: ConfirmationDialogProps) {
  const dialogRef = React.useRef<HTMLDialogElement>(null);
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  const submitOnce = React.useRef(createConfirmationSubmission());
  const mounted = React.useRef(false);
  const [pending, setPending] = React.useState(false);
  const titleId = React.useId();
  const descriptionId = React.useId();
  const label = action === "archive" ? "Archive" : "Unarchive";

  React.useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  React.useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement;
    if (open) {
      dialog.showModal();
      cancelRef.current?.focus();
    } else {
      dialog.close();
    }
    return () => {
      dialog.close();
      if (open && previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus();
    };
  }, [open]);

  const confirm = () => submitOnce.current(async () => {
    if (count === 0) return;
    setPending(true);
    try {
      await onConfirm();
      if (mounted.current) onOpenChange(false);
    } finally {
      if (mounted.current) setPending(false);
    }
  });

  return (
    <dialog ref={dialogRef} aria-labelledby={titleId} aria-describedby={descriptionId}
      aria-busy={pending} className="m-auto w-[calc(100%-2rem)] max-w-[28rem] rounded-xl border-0 bg-transparent p-0 backdrop:bg-black/50"
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onOpenChange(false);
      }}>
      {/* Shared DialogContent's w-full + mx-4 overflows this native dialog. */}
      <div className="max-h-[90vh] w-full min-w-0 overflow-y-auto rounded-xl bg-white p-6">
        <h2 id={titleId} className="break-words text-lg font-semibold text-slate-900">{label} selected {recordName}{count !== 1 ? "s" : ""}?</h2>
        <p id={descriptionId} className="mt-2 break-words text-sm text-slate-600">
          {label} {count} selected {recordName}{count !== 1 ? "s" : ""}?
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Button ref={cancelRef} type="button" variant="outline" disabled={pending}
            onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button type="button" variant={action === "archive" ? "destructive" : "default"}
            disabled={pending || count === 0} onClick={confirm}>
            {pending ? (action === "archive" ? "Archiving..." : "Unarchiving...") : label}
          </Button>
        </div>
      </div>
    </dialog>
  );
}
