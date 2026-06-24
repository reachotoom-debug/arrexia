import { Suspense } from "react";
import { requireWorkspace } from "@/lib/auth/server";
import { SettingsWidth } from "./_components/SettingsWidth";

export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ workspaceId: string }>;
}) {
  const { workspaceId } = await params;
  await requireWorkspace(workspaceId);

  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-[72rem] min-w-0 px-4 py-10 md:px-6">
          <div className="h-40 animate-pulse rounded-xl bg-slate-100" />
        </div>
      }
    >
      <SettingsWidth>{children}</SettingsWidth>
    </Suspense>
  );
}
