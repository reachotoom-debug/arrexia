"use client";

import { useCallback, useState } from "react";
import clsx from "clsx";
import { Sparkles, Loader2, Copy, MessageCircle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/use-toast";
import { generateCollectionMessageAction } from "@/app/[workspaceId]/actions/generateCollectionMessage";
import { buildWhatsAppClickToChatUrl } from "@/lib/whatsapp/buildWhatsAppClickToChatUrl";
import {
  COLLECTION_MESSAGE_TONES,
  type CollectionMessageTone,
} from "@/lib/ai/types";

type AiCollectionAssistDialogProps = {
  workspaceId: string;
  invoiceId: string;
  clientPhone: string | null | undefined;
  clientCountry?: string | null;
  variant?: "link" | "button";
};

const TONE_LABELS: Record<CollectionMessageTone, string> = {
  friendly: "Friendly",
  professional: "Professional",
  firm: "Firm",
  final_notice: "Final Notice",
};

export function AiCollectionAssistDialog({
  workspaceId,
  invoiceId,
  clientPhone,
  clientCountry,
  variant = "link",
}: AiCollectionAssistDialogProps) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [tone, setTone] = useState<CollectionMessageTone>("professional");
  const [message, setMessage] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  const whatsAppUrl =
    message && clientPhone
      ? buildWhatsAppClickToChatUrl({
          phone: clientPhone,
          clientCountry,
          message,
        })
      : null;

  const resetDialog = useCallback(() => {
    setMessage(null);
    setTone("professional");
    setIsGenerating(false);
  }, []);

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen);
    if (!nextOpen) {
      resetDialog();
    }
  };

  const handleGenerate = async () => {
    if (isGenerating) return;

    setIsGenerating(true);
    try {
      const result = await generateCollectionMessageAction({
        workspaceId,
        invoiceId,
        tone,
      });

      if (!result.ok) {
        toast({
          title: "Arrexia AI",
          description: result.userMessage,
          variant: "destructive",
        });
        return;
      }

      setMessage(result.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = async () => {
    if (!message) return;

    try {
      await navigator.clipboard.writeText(message);
      toast({
        title: "Message copied",
        description: "The collection message was copied to your clipboard.",
      });
    } catch {
      toast({
        title: "Copy failed",
        description: "We couldn't copy the message. Please select and copy it manually.",
        variant: "destructive",
      });
    }
  };

  const handleUseWhatsApp = () => {
    if (!whatsAppUrl) return;
    window.open(whatsAppUrl, "_blank", "noopener,noreferrer");
  };

  const triggerClassName =
    variant === "button"
      ? "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-violet-700"
      : "inline-flex items-center gap-1.5 text-sm font-medium text-violet-600 hover:text-violet-800 hover:underline";

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={triggerClassName}>
        <Sparkles className="h-3.5 w-3.5 shrink-0" />
        <span>AI Assist</span>
      </button>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>AI Collection Assistant</DialogTitle>
            <DialogDescription>Powered by Arrexia AI</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 p-6 pt-0">
            <div>
              <p className="mb-2 text-sm font-medium text-slate-700">Tone</p>
              <div className="flex flex-wrap gap-2">
                {COLLECTION_MESSAGE_TONES.map((option) => (
                  <button
                    key={option}
                    type="button"
                    disabled={isGenerating}
                    onClick={() => setTone(option)}
                    className={clsx(
                      "rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                      tone === option
                        ? "bg-violet-100 text-violet-800 ring-1 ring-inset ring-violet-300"
                        : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                    )}
                  >
                    {TONE_LABELS[option]}
                  </button>
                ))}
              </div>
            </div>

            {message ? (
              <textarea
                readOnly
                value={message}
                rows={12}
                className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800"
              />
            ) : (
              <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                Choose a tone and click Generate to create a collection message.
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              {!message ? (
                <Button type="button" onClick={handleGenerate} disabled={isGenerating}>
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Generating...
                    </>
                  ) : (
                    "Generate"
                  )}
                </Button>
              ) : (
                <>
                  <Button type="button" variant="outline" onClick={handleGenerate} disabled={isGenerating}>
                    {isGenerating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Regenerating...
                      </>
                    ) : (
                      "Regenerate"
                    )}
                  </Button>
                  <Button type="button" variant="outline" onClick={handleCopy} disabled={isGenerating}>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </Button>
                  <Button
                    type="button"
                    onClick={handleUseWhatsApp}
                    disabled={!whatsAppUrl || isGenerating}
                    className="bg-emerald-600 hover:bg-emerald-700"
                  >
                    <MessageCircle className="mr-2 h-4 w-4" />
                    Use in WhatsApp
                  </Button>
                </>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
