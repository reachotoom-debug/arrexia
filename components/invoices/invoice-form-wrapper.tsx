"use client";

import { useRouter } from "next/navigation";
import InvoiceForm from "./invoice-form";

interface InvoiceFormWrapperProps {
  workspaceId: string;
  clients: { id: string; name: string }[];
  initialValues?: any;
  onSubmit: (values: any) => Promise<void>;
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

