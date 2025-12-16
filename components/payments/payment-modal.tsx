"use client";

import { createPortal } from "react-dom";
import PaymentForm from "./payment-form";
import { type PaymentFormValues } from "@/lib/schemas/payment";

interface PaymentModalProps {
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
  initialValues?: Partial<PaymentFormValues> & { id?: string };
  onSubmit: (values: PaymentFormValues) => Promise<void>;
}

export default function PaymentModal({
  workspaceId,
  isOpen,
  onClose,
  initialValues,
  onSubmit,
}: PaymentModalProps) {
  if (!isOpen) return null;

  // This will need invoices passed in - for now placeholder
  const invoices: { id: string; invoice_number: string }[] = [];

  const handleSubmit = async (values: PaymentFormValues) => {
    await onSubmit(values);
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg">
        <div className="mb-4">
          <h2 className="text-xl font-semibold text-slate-900">
            {initialValues?.id ? "Edit Payment" : "Add Payment"}
          </h2>
        </div>
        <PaymentForm
          workspaceId={workspaceId}
          invoices={invoices}
          initialValues={initialValues}
          onSubmit={handleSubmit}
          onCancel={onClose}
        />
      </div>
    </div>,
    document.body
  );
}

