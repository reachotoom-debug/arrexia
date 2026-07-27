import { Suspense } from "react";
import { ResetPasswordLoadingShell } from "@/components/auth/ResetPasswordLoadingShell";
import { ResetPasswordClient } from "./ResetPasswordClient";

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<ResetPasswordLoadingShell />}>
      <ResetPasswordClient />
    </Suspense>
  );
}
