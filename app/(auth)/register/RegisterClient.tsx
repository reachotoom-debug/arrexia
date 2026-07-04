"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterFormValues } from "@/lib/schemas/auth";
import { AuthBranding } from "@/components/auth/AuthBranding";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthSocialLogin } from "@/components/auth/AuthSocialLogin";
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
import {
  logAuthErrorDev,
  mapSupabaseAuthError,
} from "@/lib/auth/authErrors";
import {
  analyzeSignUpResponse,
  getEmailRedirectTo,
  getSupabaseProjectHost,
  logSignUpResultDev,
  SIGNUP_ALREADY_REGISTERED_MESSAGE,
  SIGNUP_CONFIRMATION_BODY,
  SIGNUP_CONFIRMATION_HEADING,
  SIGNUP_READY_TO_SIGN_IN_MESSAGE,
  type SignUpOutcome,
} from "@/lib/auth/signUpResult";
import { useAuthUrlSanitizer } from "@/lib/auth/useAuthUrlSanitizer";
import { supabaseBrowser } from "@/lib/supabase/client";

type SuccessState = {
  outcome: SignUpOutcome;
  email: string;
};

export function RegisterClient() {
  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);
  const [successState, setSuccessState] = useState<SuccessState | null>(null);
  const submitLockRef = useRef(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
    setValue,
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  });

  const prefillEmail = useCallback(
    (email: string) => {
      setValue("email", email);
    },
    [setValue]
  );

  useAuthUrlSanitizer(prefillEmail);

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") return;
    console.info("[auth/register] Supabase project:", getSupabaseProjectHost());
  }, []);

  useEffect(() => {
    if (cooldownSeconds <= 0) return;

    const timer = setInterval(() => {
      setCooldownSeconds((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [cooldownSeconds]);

  const parseCooldownSeconds = (message: string): number => {
    const match = message.match(/after\s+(\d+)\s+seconds?/i);
    return match ? parseInt(match[1]!, 10) : 0;
  };

  const handleResendConfirmation = async () => {
    if (!successState?.email || isResending || cooldownSeconds > 0) {
      return;
    }

    setIsResending(true);
    setResendMessage(null);

    const supabase = supabaseBrowser();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const emailRedirectTo = getEmailRedirectTo(origin);

    const { error } = await supabase.auth.resend({
      type: "signup",
      email: successState.email,
      options: emailRedirectTo ? { emailRedirectTo } : undefined,
    });

    if (error) {
      logAuthErrorDev("register/resend", error);
      const cooldown = parseCooldownSeconds(error.message);
      if (cooldown > 0) {
        setCooldownSeconds(cooldown);
      }
      setResendMessage(mapSupabaseAuthError(error.message, "resend-confirmation"));
      setIsResending(false);
      return;
    }

    setResendMessage("Confirmation email sent again. Please check your inbox.");
    setIsResending(false);
  };

  const onSubmit = async (data: RegisterFormValues) => {
    if (submitLockRef.current || isLoading || cooldownSeconds > 0) {
      return;
    }

    submitLockRef.current = true;
    setIsLoading(true);
    setResendMessage(null);

    const supabase = supabaseBrowser();
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const emailRedirectTo = getEmailRedirectTo(origin);

    try {
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: emailRedirectTo ? { emailRedirectTo } : undefined,
      });

      logSignUpResultDev(signUpData, signUpError);

      const outcome = analyzeSignUpResponse(signUpData, signUpError);

      if (outcome.kind === "error") {
        logAuthErrorDev("register", outcome.message);
        const cooldown = parseCooldownSeconds(outcome.message);
        if (cooldown > 0) {
          setCooldownSeconds(cooldown);
        }
        setError("root", {
          message: mapSupabaseAuthError(outcome.message, "register"),
        });
        return;
      }

      if (outcome.kind === "ready_to_sign_in" && signUpData.session) {
        await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      }

      setSuccessState({ outcome, email: data.email });
    } catch (error) {
      logAuthErrorDev("register", error);
      setError("root", {
        message: mapSupabaseAuthError(
          error instanceof Error ? error.message : "An unexpected error occurred",
          "register",
        ),
      });
    } finally {
      submitLockRef.current = false;
      setIsLoading(false);
    }
  };

  const isSubmitDisabled = isLoading || cooldownSeconds > 0 || successState !== null;

  if (successState) {
    const { outcome } = successState;
    const showResend =
      outcome.kind === "confirmation_sent" || outcome.kind === "already_registered";

    let heading = SIGNUP_CONFIRMATION_HEADING;
    let body = SIGNUP_CONFIRMATION_BODY;

    if (outcome.kind === "already_registered") {
      heading = "Unable to create a new account with this email";
      body = SIGNUP_ALREADY_REGISTERED_MESSAGE;
    } else if (outcome.kind === "ready_to_sign_in") {
      heading = "Account created";
      body = SIGNUP_READY_TO_SIGN_IN_MESSAGE;
    }

    return (
      <AuthCard>
        <AuthBranding />

        <div className={authFormClass}>
          <div className={authNoticeClass}>
            <p className="mb-1 font-medium">{heading}</p>
            <p className="text-blue-600">{body}</p>
            {resendMessage ? (
              <p className="mt-2 text-blue-600">{resendMessage}</p>
            ) : null}
          </div>

          {showResend ? (
            <button
              type="button"
              onClick={handleResendConfirmation}
              disabled={isResending || cooldownSeconds > 0}
              className={authButtonClass}
            >
              {isResending
                ? "Sending..."
                : cooldownSeconds > 0
                  ? `Resend in ${cooldownSeconds}s`
                  : "Resend confirmation email"}
            </button>
          ) : null}

          <Link href="/login" className={`${authButtonClass} inline-block text-center`}>
            Back to Sign In
          </Link>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <AuthBranding />

      <AuthSocialLogin returnTo="/register" disabled={isSubmitDisabled} />

      <form method="post" onSubmit={handleSubmit(onSubmit)} className={authFormClass}>
        <div>
          <label className={authFieldLabelClass}>Email</label>
          <input
            type="email"
            {...register("email")}
            className={authInputClass}
            placeholder="you@example.com"
            autoComplete="email"
            disabled={isSubmitDisabled}
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label className={authFieldLabelClass}>Password</label>
          <input
            type="password"
            {...register("password")}
            className={authInputClass}
            placeholder="••••••••"
            autoComplete="new-password"
            disabled={isSubmitDisabled}
          />
          {errors.password && (
            <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
          )}
        </div>

        <div>
          <label className={authFieldLabelClass}>Confirm Password</label>
          <input
            type="password"
            {...register("confirmPassword")}
            className={authInputClass}
            placeholder="••••••••"
            autoComplete="new-password"
            disabled={isSubmitDisabled}
          />
          {errors.confirmPassword && (
            <p className="mt-1 text-xs text-red-600">
              {errors.confirmPassword.message}
            </p>
          )}
        </div>

        {errors.root && (
          <div className={authErrorClass}>
            {errors.root.message}
          </div>
        )}

        <button type="submit" disabled={isSubmitDisabled} className={authButtonClass}>
          {isLoading
            ? "Creating account..."
            : cooldownSeconds > 0
              ? `Try again in ${cooldownSeconds}s`
              : "Create account"}
        </button>
      </form>

      <p className={authFooterClass}>
        Already have an account?{" "}
        <Link href="/login" className={authFooterLinkClass}>
          Sign in
        </Link>
      </p>
    </AuthCard>
  );
}
