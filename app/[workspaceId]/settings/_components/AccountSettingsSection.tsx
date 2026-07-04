"use client";

import { useRef, useState, useTransition } from "react";
import { uploadAvatar, removeAvatar, resetAvatarToDefault, saveAccountProfile } from "../actions";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { MAX_AVATAR_FILE_SIZE_BYTES, ALLOWED_AVATAR_MIME_TYPES } from "@/lib/constants";
import { SettingsCard } from "./SettingsCard";

type AccountSettingsSectionProps = {
  profile: {
    full_name?: string | null;
    email?: string | null;
    avatar_url?: string | null;
  } | null;
};

export function AccountSettingsSection({ profile }: AccountSettingsSectionProps) {
  const avatarFileInputRef = useRef<HTMLInputElement>(null);
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
        description: "Your avatar has been reset to the Arrexia default.",
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
    <div className="w-full max-w-5xl">
      <form onSubmit={onSubmit} className="w-full max-w-5xl">
        <SettingsCard>
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-4 border-b border-slate-100 pb-8 sm:flex-row sm:items-start sm:gap-8">
              <div
                className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-100 text-lg font-medium text-slate-600 ring-1 ring-slate-200"
                aria-hidden
              >
                {avatarPreview ? (
                  <img
                    src={avatarPreview}
                    alt="Avatar preview"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span>{getInitials()}</span>
                )}
              </div>

              <div className="min-w-0 flex-1 space-y-3">
                <div className="space-y-1">
                  <h3 className="text-base font-semibold tracking-tight text-slate-900">
                    Profile photo
                  </h3>
                  <p className="text-xs text-slate-500">
                    Your avatar is only used inside Arrexia (sidebar and account menu). It does not appear on invoices.
                  </p>
                </div>
                <input
                  ref={avatarFileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="sr-only"
                  tabIndex={-1}
                  onChange={handleFileChange}
                  disabled={isPending || isRemoving || isResetting}
                />
                <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-stretch">
                  <Button
                    type="button"
                    variant="default"
                    size="sm"
                    disabled={isPending || isRemoving || isResetting}
                    className="w-full shrink-0 sm:w-auto"
                    aria-label="Upload or change profile photo"
                    onClick={() => avatarFileInputRef.current?.click()}
                  >
                    {isPending ? "Uploading..." : "Change photo"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleRemoveClick}
                    disabled={!avatarPreview || isRemoving || isPending || isResetting}
                    className="w-full shrink-0 border-red-200 text-red-700 hover:bg-red-50 sm:w-auto"
                  >
                    {isRemoving ? "Removing..." : "Remove avatar"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleResetClick}
                    disabled={isPending || isRemoving || isResetting}
                    className="w-full shrink-0 sm:w-auto"
                  >
                    {isResetting ? "Resetting..." : "Reset to Arrexia avatar"}
                  </Button>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2 md:gap-8">
              <div className="space-y-1">
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="account-full-name">
                  Full name
                </label>
                <input
                  id="account-full-name"
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Your name"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-transparent focus:ring-2 focus:ring-blue-600"
                />
              </div>

              <div className="space-y-1">
                <label className="mb-1 block text-sm font-medium text-slate-700" htmlFor="account-email">
                  Email
                </label>
                <input
                  id="account-email"
                  type="email"
                  value={profile?.email ?? ""}
                  disabled
                  className="w-full cursor-not-allowed rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 text-sm text-slate-500"
                />
              </div>
            </div>

            <div className="flex justify-end border-t border-slate-100 pt-6">
              <Button type="submit" disabled={isPending || isRemoving || isResetting}>
                {isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </div>
        </SettingsCard>
      </form>
    </div>
  );
}
