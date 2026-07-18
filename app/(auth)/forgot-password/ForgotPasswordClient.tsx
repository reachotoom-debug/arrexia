"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
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
} from "@/components/auth/authFormStyles";
import {
  logAuthErrorDev,
} from "@/lib/auth/authErrors";
import {
  buildPasswordResetCallbackUrl,
  mapPasswordResetRequestError,
} from "@/lib/auth/passwordRecovery";
import { getClientAppOrigin } from "@/lib/config/appUrl";
import { supabaseBrowser } from "@/lib/supabase/client";

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
});

type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;

export function ForgotPasswordClient() {
  const [submitted, setSubmitted] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const submitLockRef = useRef(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordValues) => {
    if (submitLockRef.current || isSending || submitted) {
      return;
    }

    submitLockRef.current = true;
    setIsSending(true);

    try {
      const supabase = supabaseBrowser();
      const redirectTo = buildPasswordResetCallbackUrl(getClientAppOrigin());

      if (process.env.NODE_ENV === "development") {
        console.info("[auth/forgot-password] redirectTo:", redirectTo);
      }

      const { error } = await supabase.auth.resetPasswordForEmail(data.email, {
        redirectTo,
      });

      if (error) {
        logAuthErrorDev("forgot-password", error);
        setError("root", { message: mapPasswordResetRequestError(error.message) });
        return;
      }

      setSubmitted(true);
    } finally {
      submitLockRef.current = false;
      setIsSending(false);
    }
  };

  const submitDisabled = isSubmitting || isSending || submitted;

  if (submitted) {
    return (
      <AuthCard>
        <AuthBranding />

        <div className="rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-700">
          <p className="font-medium">Check your email</p>
          <p className="mt-1 text-blue-600">
            If an account exists for that address, we sent a password reset link.
          </p>
        </div>

        <div className={authFooterClass}>
          <Link href="/login" className={authFooterLinkClass}>
            Back to sign in
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <AuthBranding />

      <p className="mb-6 text-center text-sm text-slate-600">
        Enter your email and we&apos;ll send you a reset link.
      </p>

      <form method="post" onSubmit={handleSubmit(onSubmit)} className={authFormClass}>
        <div>
          <label className={authFieldLabelClass}>Email</label>
          <input
            type="email"
            {...register("email")}
            className={authInputClass}
            placeholder="you@example.com"
            autoComplete="email"
            disabled={submitDisabled}
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
          )}
        </div>

        {errors.root?.message ? (
          <div className={authErrorClass}>{errors.root.message}</div>
        ) : null}

        <button type="submit" disabled={submitDisabled} className={authButtonClass}>
          {submitDisabled ? "Sending..." : "Send reset link"}
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
