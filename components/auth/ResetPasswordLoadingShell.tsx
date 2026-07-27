import { AuthBranding } from "@/components/auth/AuthBranding";
import { AuthCard } from "@/components/auth/AuthCard";
import { authFieldLabelClass, authFormClass } from "@/components/auth/authFormStyles";

/** Stable reset-password shell shown while recovery session verification runs. */
export function ResetPasswordLoadingShell() {
  return (
    <AuthCard>
      <AuthBranding />

      <div className={authFormClass}>
        <div className="text-center">
          <h2 className="text-lg font-semibold text-slate-900">Reset your password</h2>
          <p className="mt-2 text-sm text-slate-600">Verifying your reset link...</p>
        </div>

        <div className="space-y-6" aria-hidden="true">
          <div>
            <div className={`${authFieldLabelClass} h-5 w-28 rounded bg-slate-100`} />
            <div className="mt-2 h-[46px] w-full rounded-2xl bg-slate-100" />
          </div>
          <div>
            <div className={`${authFieldLabelClass} h-5 w-32 rounded bg-slate-100`} />
            <div className="mt-2 h-[46px] w-full rounded-2xl bg-slate-100" />
          </div>
          <div className="h-[46px] w-full rounded-2xl bg-slate-100" />
        </div>
      </div>
    </AuthCard>
  );
}
