"use client";

import { DEFAULT_AVATAR_URL } from "@/lib/constants";

type BrandPreviewProps = {
  workspaceLogoUrl?: string | null;
  fallbackWorkspaceName?: string;
  userAvatarUrl?: string | null;
  userEmail?: string | null;
};

function getInitialsFromEmail(email: string | null | undefined): string {
  if (!email) return "FC";
  const beforeAt = email.split("@")[0];
  if (!beforeAt) return "FC";
  return beforeAt.charAt(0).toUpperCase();
}

function getWorkspaceInitials(name: string | undefined): string {
  if (!name) return "FC";
  const trimmed = name.trim();
  if (trimmed.length === 0) return "FC";
  return trimmed.charAt(0).toUpperCase();
}

export function BrandPreview({
  workspaceLogoUrl,
  fallbackWorkspaceName,
  userAvatarUrl,
  userEmail,
}: BrandPreviewProps) {
  const workspaceInitials = getWorkspaceInitials(fallbackWorkspaceName);
  const userInitials = getInitialsFromEmail(userEmail);
  const effectiveUserAvatarUrl = userAvatarUrl || DEFAULT_AVATAR_URL;

  return (
    <div className="mb-6 md:grid md:grid-cols-2 md:gap-4 space-y-4 md:space-y-0">
      {/* Invoice Preview Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex gap-3 items-start shadow-sm">
        <div className="flex-shrink-0">
          {workspaceLogoUrl ? (
            <div className="h-10 w-10 rounded border border-slate-200 bg-white overflow-hidden flex items-center justify-center">
              <img
                src={workspaceLogoUrl}
                alt="Workspace logo"
                className="h-full w-full object-contain"
              />
            </div>
          ) : (
            <div className="h-10 w-10 rounded bg-blue-600 flex items-center justify-center">
              <span className="text-xs font-semibold text-white">{workspaceInitials}</span>
            </div>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="mb-1">
            <p className="text-sm font-medium text-slate-900">Workspace logo</p>
            <p className="text-xs text-slate-500">
              Used on invoices, PDFs, and client emails
            </p>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Source: Workspace → Workspace Profile → Logo URL / Upload
          </p>
        </div>
      </div>

      {/* App Chrome Preview Card */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 flex gap-3 items-start shadow-sm">
        <div className="flex-shrink-0">
          <div className="h-10 w-10 rounded-full bg-blue-600 overflow-hidden flex items-center justify-center">
            {userAvatarUrl ? (
              <img
                src={userAvatarUrl}
                alt="User avatar"
                className="h-full w-full object-cover"
              />
            ) : (
              <img
                src={DEFAULT_AVATAR_URL}
                alt="Default avatar"
                className="h-full w-full object-cover"
              />
            )}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <div className="mb-1">
            <p className="text-sm font-medium text-slate-900">User avatar</p>
            <p className="text-xs text-slate-500">
              Shown in FlowCollect sidebar & account menu
            </p>
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Source: Settings → Account → Profile photo
          </p>
        </div>
      </div>
    </div>
  );
}

