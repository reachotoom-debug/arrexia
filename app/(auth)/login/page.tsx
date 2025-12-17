"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabaseBrowser } from "@/lib/supabase/client";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(6, "Password must be at least 6 characters"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    setError,
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginFormValues) => {
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email,
      password: data.password,
    });

    if (error) {
      setError("root", { message: error.message || "Failed to sign in" });
      return;
    }

    // After sign-in, find a workspace (first membership). If none, go to onboarding.
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setError("root", { message: "Signed in, but no user found" });
      return;
    }

    const { data: memberships, error: membershipsError } = await supabase
      .from("workspace_members")
      .select("workspace_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1);

    if (membershipsError) {
      setError("root", { message: membershipsError.message || "Failed to load workspace" });
      return;
    }

    const workspaceId = memberships?.[0]?.workspace_id;
    if (!workspaceId) {
      router.push("/pricing");
      return;
    }

    router.push(`/${workspaceId}/dashboard`);
  };

  return (
      <div className="w-full max-w-md rounded-xl bg-white p-8 shadow-sm border border-slate-200">
      <div className="text-center mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          FlowCollect
        </h1>
        <p className="text-sm text-slate-500">
          Cash Solved.
        </p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Email
          </label>
          <input
            type="email"
            {...register("email")}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
            placeholder="you@example.com"
            autoComplete="email"
          />
          {errors.email && (
            <p className="mt-1 text-xs text-red-600">{errors.email.message}</p>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Password
          </label>
          <input
            type="password"
            {...register("password")}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-slate-900 focus:border-transparent"
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

        <button
          type="submit"
          disabled={isSubmitting}
          className="w-full rounded-lg bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
        >
          {isSubmitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
