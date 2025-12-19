"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterFormValues } from "@/lib/schemas/auth";
import { supabaseBrowser } from "@/lib/supabase/client";
import { useState, useEffect } from "react";

export function RegisterClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get("next");

  const [cooldownSeconds, setCooldownSeconds] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
    setError,
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  });

  // Countdown timer for cooldown
  useEffect(() => {
    if (cooldownSeconds > 0) {
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
    }
  }, [cooldownSeconds]);

  // Parse seconds from error message
  const parseCooldownSeconds = (message: string): number => {
    const match = message.match(/after\s+(\d+)\s+seconds?/i);
    return match ? parseInt(match[1]!, 10) : 0;
  };

  const onSubmit = async (data: RegisterFormValues) => {
    if (isLoading || cooldownSeconds > 0) {
      return; // Prevent double submission
    }

    setIsLoading(true);
    const supabase = supabaseBrowser();
    const next = nextUrl || "/start";
    const origin = typeof window !== "undefined" ? window.location.origin : "";

    try {
      // Try sign up first
      const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          emailRedirectTo: origin ? `${origin}/auth/callback?next=${encodeURIComponent(next)}` : undefined,
        },
      });

      // If user already exists, try sign in instead
      if (signUpError) {
        if (
          signUpError.message.includes("already registered") ||
          signUpError.message.includes("User already registered")
        ) {
          const { error: signInError } = await supabase.auth.signInWithPassword({
            email: data.email,
            password: data.password,
          });

          if (signInError) {
            const cooldown = parseCooldownSeconds(signInError.message);
            if (cooldown > 0) {
              setCooldownSeconds(cooldown);
            }
            setError("root", { message: signInError.message || "Failed to sign in" });
            setIsLoading(false);
            return;
          }

          // Sign in successful, redirect
          router.replace(next);
          return;
        }

        // Check for rate limit cooldown
        const cooldown = parseCooldownSeconds(signUpError.message);
        if (cooldown > 0) {
          setCooldownSeconds(cooldown);
        }

        setError("root", { message: signUpError.message || "Failed to create account" });
        setIsLoading(false);
        return;
      }

      // Check if session was created immediately (email confirmations off)
      if (signUpData.session) {
        // Session created, redirect immediately
        router.replace(next);
        return;
      }

      // Email confirmation required - show success state
      setIsSuccess(true);
      setIsLoading(false);
    } catch (error) {
      setError("root", {
        message: error instanceof Error ? error.message : "An unexpected error occurred",
      });
      setIsLoading(false);
    }
  };

  const isSubmitDisabled = isLoading || cooldownSeconds > 0 || isSuccess;

  // Success state - hide form, show message
  if (isSuccess) {
    const loginUrl = nextUrl ? `/login?next=${encodeURIComponent(nextUrl)}` : "/login";
    return (
      <div className="flex justify-center">
        <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-sm">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
              FlowCollect
            </h1>
            <p className="text-sm text-slate-500">Cash Solved.</p>
          </div>

          <div className="space-y-4">
            <div className="rounded-lg bg-blue-50 px-4 py-3 text-sm text-blue-700">
              <p className="font-medium mb-1">Check your email to confirm your account</p>
              <p className="text-blue-600">
                We've sent a confirmation link to your email address. Please click the link to
                verify your account before signing in.
              </p>
            </div>

            <button
              type="button"
              onClick={() => router.push(loginUrl)}
              className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2"
            >
              Continue to Sign In
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex justify-center">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            FlowCollect
          </h1>
          <p className="text-sm text-slate-500">Cash Solved.</p>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">Email</label>
            <input
              type="email"
              {...register("email")}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              placeholder="your@email.com"
              disabled={isSubmitDisabled}
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">Password</label>
            <input
              type="password"
              {...register("password")}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              placeholder="••••••••"
              disabled={isSubmitDisabled}
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-600">{errors.password.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Confirm Password
            </label>
            <input
              type="password"
              {...register("confirmPassword")}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              placeholder="••••••••"
              disabled={isSubmitDisabled}
            />
            {errors.confirmPassword && (
              <p className="mt-1 text-xs text-red-600">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          {errors.root && (
            <div
              className={`rounded-lg px-3 py-2 text-sm ${
                errors.root.type === "info"
                  ? "bg-blue-50 text-blue-700"
                  : "bg-red-50 text-red-700"
              }`}
            >
              {errors.root.message}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitDisabled}
            className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isLoading
              ? "Creating account..."
              : cooldownSeconds > 0
              ? `Try again in ${cooldownSeconds}s`
              : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
