"use client";

import { useRouter } from "next/navigation";
import InvoiceForm from "./invoice-form";
import type { InvoiceFormValues } from "@/lib/schemas/invoice";

interface InvoiceFormWrapperProps {
  workspaceId: string;
  clients: { id: string; name: string }[];
  initialValues?: Partial<InvoiceFormValues> & { id?: string };
  onSubmit: (values: InvoiceFormValues) => Promise<void>;
}

export default function InvoiceFormWrapper({
  workspaceId,
  clients,
  initialValues,
  onSubmit,
}: InvoiceFormWrapperProps) {
  const router = useRouter();

  return (
    <InvoiceForm
      workspaceId={workspaceId}
      clients={clients}
      initialValues={initialValues}
      onSubmit={onSubmit}
      onCancel={() => router.push(`/${workspaceId}/invoices`)}
    />
  );
}

