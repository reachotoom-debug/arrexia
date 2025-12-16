"use client";

import { useRef, useState, useEffect } from "react";
import { Upload } from "lucide-react";
import { useToast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { uploadWorkspaceLogo } from "@/app/[workspaceId]/settings/actions";

interface LogoUploaderProps {
  workspaceId: string;
  value: string | null;
  onChange: (url: string) => void;
}

const MAX_LOGO_FILE_SIZE_BYTES = 800 * 1024; // 800 KB, safely under Next 1 MB default
const ALLOWED_LOGO_TYPES = ["image/png", "image/jpeg", "image/jpg", "image/webp"];

function validateLogoFile(file: File): string | null {
  if (!ALLOWED_LOGO_TYPES.includes(file.type)) {
    return "Please upload a PNG, JPG, or WEBP image.";
  }
  if (file.size > MAX_LOGO_FILE_SIZE_BYTES) {
    // 800 KB UI limit keeps us under the 1MB/5MB action limit, even with overhead.
    return "Logo is too large. Please upload an image under 800 KB.";
  }
  return null;
}

export function LogoUploader({
  workspaceId,
  value,
  onChange,
}: LogoUploaderProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(value ?? null);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const { toast } = useToast();

  // Update preview when value changes from outside
  useEffect(() => {
    setPreviewUrl(value ?? null);
  }, [value]);

  const handleFileSelected = async (file: File) => {
    // Validate file before any upload attempt
    const validationError = validateLogoFile(file);
    if (validationError) {
      toast({
        variant: "destructive",
        title: "Invalid file",
        description: validationError,
      });
      return;
    }

    setUploading(true);

    try {
      const result = await uploadWorkspaceLogo(workspaceId, file);

      if (!result.success || !result.url) {
        toast({
          variant: "destructive",
          title: "Upload failed",
          description: result.error ?? "Could not upload logo.",
        });
        return;
      }

      // Update form value and preview
      onChange(result.url);
      setPreviewUrl(result.url);

      toast({
        title: "Logo uploaded",
        description: "Your logo has been uploaded successfully.",
      });
    } catch (error) {
      console.error("[LogoUploader] upload failed", error);
      toast({
        variant: "destructive",
        title: "Upload failed",
        description: "Failed to upload logo. Please try again.",
      });
    } finally {
      setUploading(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const file = e.dataTransfer.files?.[0];
    if (!file) return;

    handleFileSelected(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    handleFileSelected(file);
    // Reset input
    e.target.value = "";
  };

  const handleUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleUrlChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const url = event.target.value;
    onChange(url);
    // Preview will update via useEffect
  };

  return (
    <div className="space-y-3">
      {/* Top row: Preview, URL Input, Upload Button */}
      <div className="flex items-center gap-4">
        {/* Preview */}
        <div className="h-14 w-14 rounded-md border border-slate-200 bg-slate-50 overflow-hidden flex items-center justify-center flex-shrink-0">
          {previewUrl ? (
            <img
              src={previewUrl}
              alt="Workspace logo"
              className="h-full w-full object-contain"
              onError={() => {
                // If image fails to load, clear preview
                setPreviewUrl(null);
              }}
            />
          ) : (
            <span className="text-xs text-slate-400">No logo</span>
          )}
        </div>

        {/* URL Input */}
        <div className="flex-1">
          <input
            type="url"
            value={value ?? ""}
            onChange={handleUrlChange}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-600 focus:border-transparent"
            placeholder="https://example.com/logo.png"
          />
        </div>

        {/* Upload Button */}
        <div className="flex-shrink-0">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={handleFileInputChange}
            className="hidden"
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleUploadClick}
            disabled={uploading}
          >
            <Upload className="h-4 w-4 mr-2" />
            {uploading ? "Uploading..." : "Upload"}
          </Button>
        </div>
      </div>

      {/* Dropzone area */}
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-md border border-dashed px-4 py-5 text-xs text-slate-500 cursor-pointer transition-colors",
          isDragging && "border-blue-400 bg-blue-50",
          !isDragging && "border-slate-300 hover:border-slate-400 hover:bg-slate-50"
        )}
        onClick={handleUploadClick}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <span className="font-medium text-slate-700">Drag & drop logo here</span>
        <span className="text-[11px] text-slate-500 mt-1">
          or click <span className="font-semibold text-slate-700">Upload</span> • PNG, JPG, or WEBP • Max 800 KB
        </span>
      </div>
    </div>
  );
}
