"use client";

import type { AuthUserInfo } from "@/lib/auth/server";

interface UserMenuProps {
  user: AuthUserInfo;
}

function getInitials(fullName: string | null, email: string | null): string {
  if (fullName) {
    const parts = fullName.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return fullName.substring(0, 2).toUpperCase();
  }
  if (email) {
    return email.substring(0, 2).toUpperCase();
  }
  return "U";
}

export function UserMenu({ user }: UserMenuProps) {
  const displayName = user.fullName || user.email || "Account";
  const initials = getInitials(user.fullName, user.email);

  return (
    <button
      type="button"
      className="flex w-full items-center gap-2 px-4 py-3 border-t border-slate-200 hover:bg-slate-50 transition-colors text-left"
    >
      {user.avatarUrl ? (
        <img
          src={user.avatarUrl}
          alt={displayName}
          className="h-8 w-8 rounded-full object-cover"
        />
      ) : (
        <div className="h-8 w-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-semibold">
          {initials}
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-xs font-medium text-slate-900 truncate">
          {displayName}
        </div>
        {user.email && (
          <div className="text-[11px] text-slate-500 truncate">{user.email}</div>
        )}
      </div>
    </button>
  );
}
