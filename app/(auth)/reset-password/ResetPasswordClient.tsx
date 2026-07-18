"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AuthBranding } from "@/components/auth/AuthBranding";
import { AuthCard } from "@/components/auth/AuthCard";
import {
  authButtonClass,
  authErrorClass,
  authFieldLabelClass,
  authFooterClass,
  authFooterLinkClass,
  authFormClass,
  authInputClass,
  authNoticeClass,
} from "@/components/auth/authFormStyles";
import { logAuthErrorDev } from "@/lib/auth/authErrors";
import {
  mapPasswordResetUpdateError,
  PASSWORD_RESET_SUCCESS_MESSAGE,
  PASSWORD_RESET_SUCCESS_TITLE,
  RESET_LINK_EXPIRED_MESSAGE,
  RESET_LINK_EXPIRED_TITLE,
  shouldAllowPasswordResetSubmit,
  verifyRecoverySessionWithRetry,
} from "@/lib/auth/passwordRecovery";
import { resetPasswordSchema, type ResetPasswordValues } from "@/lib/schemas/auth";
import { supabaseBrowser } from "@/lib/supabase/client";

export function ResetPasswordClient() {
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [sessionExpired, setSessionExpired] = useState(false);
  const [completed, setCompleted] = useState(false);
  const submitLockRef = useRef(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
  });

  useEffect(() => {
    let cancelled = false;

    const verifyRecoverySession = async () => {
      const params = new URLSearchParams(window.location.search);
      const expiredFromCallback = params.get("state") === "expired";

      if (expiredFromCallback) {
        window.history.replaceState({}, "", "/reset-password");
        if (!cancelled) {
          setSessionExpired(true);
          setIsCheckingSession(false);
        }
        return;
      }

      const supabase = supabaseBrowser();
      const hasSession = await verifyRecoverySessionWithRetry(async () => {
        const { data } = await supabase.auth.getUser();
        return { data: { user: data.user } };
      });

      if (cancelled) return;

      setSessionExpired(!hasSession);
      setIsCheckingSession(false);
    };

    void verifyRecoverySession();

    return () => {
      cancelled = true;
    };
  }, []);

  const onSubmit = async (data: ResetPasswordValues) => {
    if (
      !shouldAllowPasswordResetSubmit({
        submitLocked: submitLockRef.current,
        isSubmitting,
        sessionExpired,
        completed,
      })
    ) {
      return;
    }

    submitLockRef.current = true;

    try {
      const supabase = supabaseBrowser();
      const { error } = await supabase.auth.updateUser({ password: data.password });

      if (error) {
        logAuthErrorDev("reset-password", error);
        setError("root", { message: mapPasswordResetUpdateError(error.message) });
        return;
      }

      await supabase.auth.signOut().catch(() => undefined);
      setCompleted(true);
    } finally {
      submitLockRef.current = false;
    }
  };

  if (isCheckingSession) {
    return (
      <AuthCard>
        <AuthBranding />
        <p className="text-center text-sm text-slate-500">Preparing password reset...</p>
      </AuthCard>
    );
  }

  if (sessionExpired) {
    return (
      <AuthCard>
        <AuthBranding />

        <div className="space-y-3 text-center">
          <h2 className="text-lg font-semibold text-slate-900">{RESET_LINK_EXPIRED_TITLE}</h2>
          <p className="text-sm text-slate-600">{RESET_LINK_EXPIRED_MESSAGE}</p>
        </div>

        <div className="mt-6">
          <Link href="/forgot-password" className={`${authButtonClass} inline-block text-center`}>
            Request another reset link
          </Link>
        </div>

        <div className={authFooterClass}>
          <Link href="/login" className={authFooterLinkClass}>
            Back to sign in
          </Link>
        </div>
      </AuthCard>
    );
  }

  if (completed) {
    return (
      <AuthCard>
        <AuthBranding />

        <div className={authNoticeClass}>
          <p className="font-medium">{PASSWORD_RESET_SUCCESS_TITLE}</p>
          <p className="mt-1 text-blue-600">{PASSWORD_RESET_SUCCESS_MESSAGE}</p>
        </div>

        <div className={authFooterClass}>
          <Link href="/login" className={authFooterLinkClass}>
            Sign in
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <AuthBranding />

      <p className="mb-6 text-center text-sm text-slate-600">
        Choose a new password for your account.
      </p>

      <form method="post" onSubmit={handleSubmit(onSubmit)} className={authFormClass}>
        <div>
          <label className={authFieldLabelClass}>New password</label>
          <input
            type="password"
            {...register("password")}
            className={authInputClass}
            placeholder="••••••••"
            autoComplete="new-password"
            disabled={isSubmitting}
          />
          {errors.password && (
            <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
          )}
        </div>

        <div>
          <label className={authFieldLabelClass}>Confirm password</label>
          <input
            type="password"
            {...register("confirmPassword")}
            className={authInputClass}
            placeholder="••••••••"
            autoComplete="new-password"
            disabled={isSubmitting}
          />
          {errors.confirmPassword && (
            <p className="mt-1 text-xs text-red-600">{errors.confirmPassword.message}</p>
          )}
        </div>

        {errors.root?.message ? (
          <div className={authErrorClass}>{errors.root.message}</div>
        ) : null}

        <button type="submit" disabled={isSubmitting} className={authButtonClass}>
          {isSubmitting ? "Updating..." : "Update password"}
        </button>
      </form>

      <div className={authFooterClass}>
        <Link href="/login" className={authFooterLinkClass}>
          Back to sign in
        </Link>
      </div>
    </AuthCard>
  );
}
