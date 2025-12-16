"use client";

import { useState, useTransition } from "react";
import { uploadAvatar, removeAvatar, resetAvatarToDefault, saveAccountProfile } from "../actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { MAX_AVATAR_FILE_SIZE_BYTES, ALLOWED_AVATAR_MIME_TYPES, DEFAULT_AVATAR_URL } from "@/lib/constants";

type AccountSettingsSectionProps = {
  profile: {
    full_name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  } | null;
};

export function AccountSettingsSection({ profile }: AccountSettingsSectionProps) {
  const [fullName, setFullName] = useState(profile?.full_name ?? "");
  const [avatarPreview, setAvatarPreview] = useState<string | null>(
    profile?.avatar_url ?? null
  );
  const [isPending, startTransition] = useTransition();
  const [isRemoving, startRemoveTransition] = useTransition();
  const [isResetting, startResetTransition] = useTransition();
  const { toast } = useToast();

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    // Client-side size check to avoid hitting server
    if (file.size > MAX_AVATAR_FILE_SIZE_BYTES) {
      toast({
        variant: "destructive",
        title: "Avatar too large",
        description: "Please upload an image under 1 MB.",
      });
      return;
    }

    if (!ALLOWED_AVATAR_MIME_TYPES.includes(file.type as any)) {
      toast({
        variant: "destructive",
        title: "Unsupported file type",
        description: "Please upload a PNG, JPG, or WEBP image.",
      });
      return;
    }

    // Optionally show a local preview
    const localUrl = URL.createObjectURL(file);
    setAvatarPreview(localUrl);

    const formData = new FormData();
    formData.append("avatar", file);

    startTransition(async () => {
      const result = await uploadAvatar(formData);

      if (!result.success) {
        toast({
          variant: "destructive",
          title: "Upload failed",
          description: result.error ?? "Could not upload avatar. Please try again.",
        });
        // roll back preview if needed
        setAvatarPreview(profile?.avatar_url ?? null);
        return;
      }

      toast({
        title: "Avatar updated",
        description: "Your profile image has been saved.",
      });

      // If server returns final public URL, use it
      if (result.url) {
        setAvatarPreview(result.url);
      }
    });
  }

  function handleRemoveClick() {
    startRemoveTransition(async () => {
      const result = await removeAvatar();

      if (!result.success) {
        toast({
          variant: "destructive",
          title: "Failed to remove avatar",
          description: result.error ?? "Please try again.",
        });
        return;
      }

      toast({
        title: "Avatar removed",
        description: "Your profile image has been cleared.",
      });

      // Clear preview so UI goes back to initials / placeholder
      setAvatarPreview(null);
    });
  }

  function handleResetClick() {
    startResetTransition(async () => {
      const result = await resetAvatarToDefault();

      if (!result.success) {
        toast({
          variant: "destructive",
          title: "Failed to reset avatar",
          description: result.error ?? "Please try again.",
        });
        return;
      }

      toast({
        title: "Avatar reset",
        description: "Your avatar has been reset to the FlowCollect default.",
      });

      // Update preview with the default avatar URL
      if (result.url) {
        setAvatarPreview(result.url);
      }
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await saveAccountProfile({ fullName });
      if (result?.error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: result.error,
        });
      } else {
        toast({
          title: "Profile saved",
          description: "Your profile has been updated successfully.",
        });
      }
    });
  }

  const getInitials = () => {
    if (profile?.full_name) {
      return profile.full_name.charAt(0).toUpperCase();
    }
    if (profile?.email) {
      return profile.email.charAt(0).toUpperCase();
    }
    return "U";
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">Account</h2>
        <p className="text-sm text-slate-500">
          Manage your personal profile and avatar. This is shown in the sidebar and
          across FlowCollect.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-6 max-w-xl">
        <div className="flex items-center gap-6">
          <label className="relative inline-flex h-16 w-16 shrink-0 cursor-pointer items-center justify-center rounded-full bg-slate-100 text-sm font-medium text-slate-600 ring-1 ring-slate-200 overflow-hidden">
            {avatarPreview ? (
              <img
                src={avatarPreview}
                alt="Avatar preview"
                className="h-full w-full rounded-full object-cover"
              />
            ) : (
              <span className="text-lg">{getInitials()}</span>
            )}
            <input
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp"
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              onChange={handleFileChange}
              disabled={isPending || isRemoving || isResetting}
            />
          </label>

          <div className="flex-1 space-y-2">
            <div className="space-y-1">
              <p className="text-sm font-medium text-slate-900">Profile photo</p>
              <p className="text-xs text-slate-500">
                Your avatar is only used inside FlowCollect (sidebar and account menu). It does not appear on invoices.
              </p>
            </div>
            <div className="flex flex-col gap-1 items-start">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleRemoveClick}
                disabled={!avatarPreview || isRemoving || isPending || isResetting}
                className="text-xs"
              >
                {isRemoving ? "Removing..." : "Remove avatar"}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetClick}
                disabled={isPending || isRemoving || isResetting}
                className="text-xs"
              >
                {isResetting ? "Resetting..." : "Reset to FlowCollect avatar"}
              </Button>
            </div>
          </div>
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Full name
          </label>
          <input
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Your name"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
          />
        </div>

        <div className="space-y-1">
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Email
          </label>
          <input
            type="email"
            value={profile?.email ?? ""}
            disabled
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm bg-slate-50 text-slate-500 cursor-not-allowed"
          />
        </div>

        <Button type="submit" disabled={isPending || isRemoving || isResetting}>
          {isPending ? "Saving..." : "Save Changes"}
        </Button>
      </form>
    </div>
  );
}
