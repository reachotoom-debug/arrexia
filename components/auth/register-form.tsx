"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { registerSchema, type RegisterFormValues } from "@/lib/schemas/auth";
import { buildAuthCallbackUrl } from "@/lib/config/appUrl";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextUrl = searchParams.get("next");

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
  });

  const onSubmit = async (data: RegisterFormValues) => {
    const supabase = supabaseBrowser();
    const next = nextUrl || "/start";
    const emailRedirectTo = buildAuthCallbackUrl({ next });
    
    // Try sign up first
    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email: data.email,
      password: data.password,
      options: {
        emailRedirectTo,
      },
    });

    // If user already exists, try sign in instead
    if (signUpError) {
      if (signUpError.message.includes("already registered") || signUpError.message.includes("User already registered")) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: data.email,
          password: data.password,
        });

        if (signInError) {
          setError("root", { message: signInError.message || "Failed to sign in" });
          return;
        }

        // Sign in successful, redirect
        router.replace(next);
        return;
      }

      setError("root", { message: signUpError.message || "Failed to create account" });
      return;
    }

    // Check if session was created immediately (email confirmations off)
    if (signUpData.session) {
      // Session created, redirect immediately
      router.replace(next);
      return;
    }

    // Email confirmation required - show success message
    setError("root", { 
      message: "Please check your email to confirm your account before signing in.",
      type: "info"
    });
  };

  return (
    <div className="flex justify-center">
      <div className="w-full max-w-md rounded-lg bg-white p-8 shadow-sm">
        <form method="post" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              type="email"
              {...register("email")}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              placeholder="your@email.com"
            />
            {errors.email && (
              <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              type="password"
              {...register("password")}
              className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
              placeholder="••••••••"
            />
            {errors.password && (
              <p className="mt-1 text-xs text-red-600">
                {errors.password.message}
              </p>
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
            />
            {errors.confirmPassword && (
              <p className="mt-1 text-xs text-red-600">
                {errors.confirmPassword.message}
              </p>
            )}
          </div>

          {errors.root && (
            <div className={`rounded-lg px-3 py-2 text-sm ${
              errors.root.type === "info"
                ? "bg-blue-50 text-blue-700"
                : "bg-red-50 text-red-700"
            }`}>
              {errors.root.message}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-900 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? "Creating account..." : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}

