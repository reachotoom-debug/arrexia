"use client";

import { useRouter } from "next/navigation";
import { deletePayment } from "@/app/[workspaceId]/payments/actions";

interface DeletePaymentButtonProps {
  workspaceId: string;
  paymentId: string;
}

export default function DeletePaymentButton({
  workspaceId,
  paymentId,
}: DeletePaymentButtonProps) {
  const router = useRouter();

  const handleDelete = async () => {
    if (window.confirm("Are you sure?")) {
      try {
        await deletePayment(workspaceId, paymentId);
        router.refresh();
      } catch (error) {
        alert("Failed to delete payment. Please try again.");
        console.error(error);
      }
    }
  };

  return (
    <button
      type="button"
      onClick={handleDelete}
      className="text-xs font-medium text-red-600 hover:text-red-700"
    >
      Delete
    </button>
  );
}

