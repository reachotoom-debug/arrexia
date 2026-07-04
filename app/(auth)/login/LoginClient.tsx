"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AuthBranding } from "@/components/auth/AuthBranding";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthSocialLogin } from "@/components/auth/AuthSocialLogin";
import {
  authButtonClass,
  authErrorClass,
  authFieldLabelClass,
  authFieldLabelInlineClass,
  authFooterClass,
  authFooterLinkClass,
  authFormClass,
  authInlineLinkClass,
  authInputClass,
  authPasswordRowClass,
} from "@/components/auth/authFormStyles";
import {
  logAuthErrorDev,
  mapSupabaseAuthError,
} from "@/lib/auth/authErrors";
import {
  completeAuthRedirect,
  resolvePostLoginPath,
} from "@/lib/auth/clientRedirect";
import { useAuthUrlSanitizer } from "@/lib/auth/useAuthUrlSanitizer";
import { loginSchema, type LoginFormValues } from "@/lib/schemas/auth";

export function LoginClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oauthCallbackError = searchParams.get("error");
  const nextUrl = searchParams.get("next");
  const submitLockRef = useRef(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
    setValue,
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const prefillEmail = useCallback(
    (email: string) => {
      setValue("email", email);
    },
    [setValue]
  );

  useAuthUrlSanitizer(prefillEmail);

  const onSubmit = async (data: LoginFormValues) => {
    if (submitLockRef.current || isSubmitting) {
      return;
    }

    submitLockRef.current = true;

    try {
      const loginResponse = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        cache: "no-store",
        body: JSON.stringify({
          email: data.email,
          password: data.password,
        }),
      });

      const loginPayload = (await loginResponse.json().catch(() => null)) as
        | { ok?: boolean; error?: string }
        | null;

      if (!loginResponse.ok || !loginPayload?.ok) {
        const rawError = loginPayload?.error || "Failed to sign in";
        logAuthErrorDev("login", rawError);
        setError("root", {
          message: mapSupabaseAuthError(rawError, "login"),
        });
        return;
      }

      router.refresh();

      const { redirectTo, error: redirectError } = await resolvePostLoginPath(nextUrl);

      if (redirectError) {
        logAuthErrorDev("login/post-redirect", redirectError);
        setError("root", { message: redirectError });
        return;
      }

      completeAuthRedirect(router, redirectTo);
    } finally {
      submitLockRef.current = false;
    }
  };

  return (
    <AuthCard>
      <AuthBranding />

      <AuthSocialLogin
        next={nextUrl}
        returnTo="/login"
        initialError={oauthCallbackError}
      />

      <form method="post" onSubmit={handleSubmit(onSubmit)} className={authFormClass}>
        <div>
          <label className={authFieldLabelClass}>Email</label>
          <input
            type="email"
            {...register("email")}
            className={authInputClass}
            placeholder="you@example.com"
            autoComplete="email"
            disabled={isSubmitting}
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
          )}
        </div>

        <div>
          <div className={authPasswordRowClass}>
            <label htmlFor="login-password" className={authFieldLabelInlineClass}>
              Password
            </label>
            <Link href="/forgot-password" className={authInlineLinkClass}>
              Forgot password?
            </Link>
          </div>
          <input
            id="login-password"
            type="password"
            {...register("password")}
            className={authInputClass}
            placeholder="••••••••"
            autoComplete="current-password"
            disabled={isSubmitting}
          />
          {errors.password && (
            <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
          )}
        </div>

        {errors.root && (
          <div className={authErrorClass}>{errors.root.message}</div>
        )}

        <button type="submit" disabled={isSubmitting} className={authButtonClass}>
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <div className={authFooterClass}>
        <Link href="/register" className={authFooterLinkClass}>
          Create account
        </Link>
      </div>
    </AuthCard>
  );
}
