"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { getPublicAdminBasePath } from "@/lib/admin/adminPaths";

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

    const onAuthPage = isAuthRoute(pathname);
    const supabase = supabaseBrowser();

    const { data: subscription } = supabase.auth.onAuthStateChange(async (event) => {
      // Server-side HttpOnly cookies own the session on workspace routes.
      // Do not force client redirects away from the app.
      if (event === "SIGNED_OUT" && onAuthPage) {
        router.replace("/login");
      }
    });

    if (onAuthPage) {
      (async () => {
        try {
          const { error } = await supabase.auth.getSession();

          if (error && isRefreshTokenNotFoundError(error)) {
            await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
          }
        } catch {
          // Ignore client session cleanup errors on auth pages.
        }
      })();
    }

    return () => {
      subscription?.subscription?.unsubscribe();
    };
  }, [pathname, router]);

  return null;
}
