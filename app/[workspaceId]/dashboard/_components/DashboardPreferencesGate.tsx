"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { getPrefsStorageKey } from "@/lib/preferences";

interface DashboardPreferencesGateProps {
  workspaceId: string;
  searchParams: { [key: string]: string | string[] | undefined };
}

export function DashboardPreferencesGate({
  workspaceId,
  searchParams,
}: DashboardPreferencesGateProps) {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const KEY = getPrefsStorageKey(workspaceId, "dashboard");
    const currentPreset = Array.isArray(searchParams.preset)
      ? searchParams.preset[0]
      : (searchParams.preset as string | undefined);

    // user explicitly chose a preset -> save it
    if (currentPreset) {
      const prefs = { preset: currentPreset };
      window.localStorage.setItem(KEY, JSON.stringify(prefs));
      return;
    }

    const raw = window.localStorage.getItem(KEY);
    if (!raw) return;

    try {
      const prefs = JSON.parse(raw) as { preset?: string };
      if (!prefs.preset) return;

      const params = new URLSearchParams(searchParams as any);
      params.set("preset", prefs.preset);
      const query = params.toString();
      router.replace(
        query
          ? `/${workspaceId}/dashboard?${query}`
          : `/${workspaceId}/dashboard`
      );
    } catch {
      // ignore parse errors
    }
  }, [workspaceId, searchParams, router]);

  return null;
}

