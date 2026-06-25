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
      console.info("[auth/stabilizer]", {
        event,
        pathname,
        onAuthPage,
        signOutExecuted: false,
      });

      // Server-side HttpOnly cookies own the session on workspace routes.
      // Do not force client redirects away from the app.
      if (event === "SIGNED_OUT" && onAuthPage) {
        router.replace("/login");
      }
    });

    if (onAuthPage) {
      (async () => {
        try {
          const { data, error } = await supabase.auth.getSession();
          console.info("[auth/stabilizer]", {
            pathname,
            onAuthPage: true,
            hasSession: Boolean(data.session),
            getSessionError: error?.message ?? null,
            signOutExecuted: false,
          });

          if (error && isRefreshTokenNotFoundError(error)) {
            console.info("[auth/stabilizer]", {
              pathname,
              action: "signOut_local",
              reason: "refresh_token_not_found_on_auth_page",
            });
            await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
          }
        } catch (err) {
          console.info("[auth/stabilizer]", {
            pathname,
            onAuthPage: true,
            getSessionThrew: err instanceof Error ? err.message : String(err),
            signOutExecuted: false,
          });
        }
      })();
    } else {
      console.info("[auth/stabilizer]", {
        pathname,
        onAuthPage: false,
        note: "skipping client getSession enforcement; server cookies are authoritative",
      });
    }

    return () => {
      subscription?.subscription?.unsubscribe();
    };
  }, [pathname, router]);

  return null;
}
