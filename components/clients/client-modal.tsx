"use client";

import { createPortal } from "react-dom";
import { useEffect, useState } from "react";
import ClientForm from "./client-form";
import { type ClientFormValues } from "@/lib/schemas/client";

interface ClientModalProps {
  workspaceId: string;
  isOpen: boolean;
  onClose: () => void;
  initialValues?: Partial<ClientFormValues> & { id?: string };
  onSubmit: (values: ClientFormValues) => Promise<void>;
}

export default function ClientModal({
  workspaceId,
  isOpen,
  onClose,
  initialValues,
  onSubmit,
}: ClientModalProps) {
  const [mounted, setMounted] = useState(false);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = "unset";
      };
    }
  }, [isOpen]);

  if (!isOpen || !mounted) return null;

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 200);
  };

  const handleSubmit = async (values: ClientFormValues) => {
    try {
      await onSubmit(values);
      handleClose();
    } catch (error) {
      // Error handling is done in the form
    }
  };

  return createPortal(
    <div
      className={`fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 transition-opacity duration-200 ${
        isClosing ? "opacity-0" : "opacity-100"
      }`}
      onClick={handleClose}
    >
      <div
        className={`w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl bg-white p-6 shadow-xl transition-all duration-200 ${
          isClosing ? "scale-95 opacity-0" : "scale-100 opacity-100"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-slate-900">
            {initialValues?.id ? "Edit Client" : "Add Client"}
          </h2>
        </div>
        <ClientForm
          workspaceId={workspaceId}
          initialValues={initialValues}
          onSubmit={handleSubmit}
          onCancel={handleClose}
        />
      </div>
    </div>,
    document.body
  );
}
