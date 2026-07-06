"use client";

import { useEffect, useRef } from "react";
import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { trackNewsletterSignup } from "@/lib/analytics/google";
import { subscribeToNewsletter } from "@/lib/newsletter/actions";
import type { NewsletterSignupResult } from "@/lib/newsletter/subscribe";

type NewsletterSignupProps = {
  source?: string;
  className?: string;
};

const initialState: NewsletterSignupResult | null = null;

function messageClassName(tone: NewsletterSignupResult["tone"]): string {
  if (tone === "error") {
    return "text-sm text-red-600";
  }

  return "text-sm font-medium text-emerald-700";
}

export function NewsletterSignup({ source = "blog", className = "" }: NewsletterSignupProps) {
  const [state, formAction, pending] = useActionState(subscribeToNewsletter, initialState);
  const isComplete = state?.ok === true;
  const trackedSignupRef = useRef(false);

  useEffect(() => {
    if (state?.ok && state.tone === "success" && !trackedSignupRef.current) {
      trackedSignupRef.current = true;
      trackNewsletterSignup(source);
    }
  }, [state, source]);

  return (
    <section
      className={`overflow-hidden rounded-3xl border border-slate-200 bg-gradient-to-br from-slate-50 via-white to-blue-50 p-8 shadow-sm sm:p-10 ${className}`.trim()}
      aria-labelledby="newsletter-signup-heading"
    >
      <div className="mx-auto max-w-2xl text-center">
        <h2
          id="newsletter-signup-heading"
          className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl"
        >
          Get practical cash flow insights.
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-base leading-relaxed text-slate-600">
          Receive occasional articles and tools to help you reduce overdue invoices and improve
          collections.
        </p>
      </div>

      {isComplete ? (
        <p
          className={`mx-auto mt-6 max-w-xl text-center ${messageClassName(state.tone)}`}
          role="status"
          aria-live="polite"
        >
          {state.message}
        </p>
      ) : (
        <form action={formAction} className="mx-auto mt-7 max-w-xl">
          <input type="hidden" name="source" value={source} />
          <div className="absolute left-[-9999px] top-auto h-px w-px overflow-hidden" aria-hidden="true">
            <label htmlFor="newsletter-website">Website</label>
            <input
              id="newsletter-website"
              type="text"
              name="website"
              tabIndex={-1}
              autoComplete="off"
              defaultValue=""
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="min-w-0 flex-1">
              <label htmlFor="newsletter-email" className="sr-only">
                Email address
              </label>
              <input
                id="newsletter-email"
                name="email"
                type="email"
                inputMode="email"
                autoComplete="email"
                required
                placeholder="you@company.com"
                disabled={pending}
                className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none ring-blue-600 transition-shadow placeholder:text-slate-400 focus:border-blue-600 focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60"
              />
            </div>
            <Button
              type="submit"
              disabled={pending}
              className="h-12 shrink-0 rounded-xl px-6 sm:h-auto"
            >
              {pending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  <span className="sr-only">Subscribing</span>
                  <span aria-hidden="true">Subscribing…</span>
                </>
              ) : (
                "Subscribe"
              )}
            </Button>
          </div>

          {state?.ok === false ? (
            <p className={`mt-3 text-center ${messageClassName(state.tone)}`} role="alert">
              {state.message}
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
}
