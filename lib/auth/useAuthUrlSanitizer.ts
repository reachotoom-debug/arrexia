"use client";

import { useEffect } from "react";
import { stripCredentialsFromAuthUrl } from "@/lib/auth/clientRedirect";
import { isSocialAuthEnabled } from "@/lib/auth/oauthErrors";

export function useAuthUrlSanitizer(setEmail?: (email: string) => void) {
  useEffect(() => {
    const email = stripCredentialsFromAuthUrl({
      stripOAuthErrors: !isSocialAuthEnabled(),
    });
    if (email && setEmail) {
      setEmail(email);
    }
  }, [setEmail]);
}
