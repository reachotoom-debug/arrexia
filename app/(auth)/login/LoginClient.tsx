"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { AuthBranding } from "@/components/auth/AuthBranding";
import { AuthCard } from "@/components/auth/AuthCard";
import { AuthSocialLogin } from "@/components/auth/AuthSocialLogin";
import {
  authButtonClass,
  authFieldLabelClass,
  authFooterClass,
  authFormClass,
  authInputClass,
} from "@/components/auth/authFormStyles";
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
      setError("root", {
        message: loginPayload?.error || "Failed to sign in",
      });
      return;
    }

    router.refresh();

    const { redirectTo, error: redirectError } = await resolvePostLoginPath(nextUrl);

    if (redirectError) {
      setError("root", { message: redirectError });
      return;
    }

    completeAuthRedirect(router, redirectTo);
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
            autoComplete="current-password"
          />
          {errors.password && (
            <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
          )}
        </div>

        {errors.root && (
          <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {errors.root.message}
          </div>
        )}

        <button type="submit" disabled={isSubmitting} className={authButtonClass}>
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>

      <div className={authFooterClass}>
        <Link href="/register" className="font-medium text-blue-600 hover:text-blue-700">
          Create account
        </Link>
      </div>
    </AuthCard>
  );
}
