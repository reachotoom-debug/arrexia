"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

function isRefreshTokenNotFoundError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const anyErr = err as any;
  const msg = String(anyErr?.message ?? "");
  const code = String(anyErr?.code ?? "");

  return (
    code === "refresh_token_not_found" ||
    msg.includes("refresh_token_not_found") ||
    msg.includes("Invalid Refresh Token") ||
    msg.includes("Refresh Token Not Found")
  );
}

import { getPublicAdminBasePath } from "@/lib/admin/adminPaths";

function isAuthRoute(pathname: string | null): boolean {
  if (!pathname) return false;
  const adminBase = getPublicAdminBasePath();
  return (
    pathname === "/login" ||
    pathname.startsWith("/register") ||
    pathname.startsWith("/auth") ||
    pathname === adminBase ||
    pathname.startsWith(`${adminBase}/`) ||
    pathname === "/admin" ||
    pathname.startsWith("/admin/")
  );
}

export function SupabaseAuthStabilizer() {
  const router = useRouter();
  const pathname = usePathname();
  const didInit = useRef(false);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    const supabase = supabaseBrowser();

    // Register listener early, and never throw from it.
    const { data: subscription } = supabase.auth.onAuthStateChange(async (event) => {
      if (event === "SIGNED_OUT") {
        if (!isAuthRoute(pathname)) router.replace("/login");
      }
    });

    // Defensive session check: stale refresh tokens can surface here.
    (async () => {
      try {
        const { error } = await supabase.auth.getSession();
        if (error && isRefreshTokenNotFoundError(error)) {
          await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
          if (!isAuthRoute(pathname)) router.replace("/login");
        }
      } catch (err) {
        if (isRefreshTokenNotFoundError(err)) {
          await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
          if (!isAuthRoute(pathname)) router.replace("/login");
        }
      }
    })();

    return () => {
      subscription?.subscription?.unsubscribe();
    };
    // Intentionally run once; pathname/router changes should not re-register clients.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

