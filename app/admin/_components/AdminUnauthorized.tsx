import Link from "next/link";
import { Button } from "@/components/ui/button";

export function AdminUnauthorized() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Unauthorized</h1>
        <p className="mt-3 text-sm text-slate-600">
          Your account does not have access to the FlowCollect admin panel.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link href="/pricing">
            <Button>Back to site</Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
