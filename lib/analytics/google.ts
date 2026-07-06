/**
 * Google Analytics 4 helpers.
 *
 * Measurement ID: set `NEXT_PUBLIC_GA_MEASUREMENT_ID` (e.g. G-XXXXXXXXXX) in production.
 * Analytics only loads when NODE_ENV is `production` and the ID is present.
 *
 * Custom events: import a typed helper below, e.g. `trackToolUsed({ tool: "dso_calculator" })`.
 */

export const GA_EVENTS = {
  START_FREE_TRIAL: "start_free_trial",
  LOGIN: "login",
  REGISTER: "register",
  NEWSLETTER_SIGNUP: "newsletter_signup",
  BLOG_SEARCH: "blog_search",
  BLOG_CATEGORY_VIEW: "blog_category_view",
  TOOL_USED: "tool_used",
  CONTACT_SUBMIT: "contact_submit",
} as const;

export type GaEventName = (typeof GA_EVENTS)[keyof typeof GA_EVENTS];

export type GaEventParams = Record<string, string | number | boolean>;

declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

/** Public GA4 measurement ID from `NEXT_PUBLIC_GA_MEASUREMENT_ID`. */
export function getGaMeasurementId(): string | null {
  const id = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim();
  if (!id) return null;
  return id;
}

/** True when analytics should load or send events (production + measurement ID). */
export function isAnalyticsEnabled(): boolean {
  return process.env.NODE_ENV === "production" && getGaMeasurementId() !== null;
}

function gtag(...args: unknown[]): void {
  if (typeof window === "undefined" || !isAnalyticsEnabled()) return;
  window.gtag?.(...args);
}

/** Track a route change. Initial load is handled by gtag config — skip duplicate on first paint. */
export function pageview(pagePath: string): void {
  const measurementId = getGaMeasurementId();
  if (!measurementId) return;

  gtag("event", "page_view", {
    page_path: pagePath,
    send_to: measurementId,
  });
}

/** Low-level custom event. Prefer typed helpers when available. */
export function trackEvent(event: GaEventName, params?: GaEventParams): void {
  if (!params || Object.keys(params).length === 0) {
    gtag("event", event);
    return;
  }

  gtag("event", event, params);
}

export function trackStartFreeTrial(source: string, plan?: string): void {
  trackEvent(GA_EVENTS.START_FREE_TRIAL, {
    source,
    ...(plan ? { plan } : {}),
  });
}

export function trackLogin(method = "email"): void {
  trackEvent(GA_EVENTS.LOGIN, { method });
}

export function trackRegister(params?: { method?: string; requires_confirmation?: boolean }): void {
  trackEvent(GA_EVENTS.REGISTER, {
    method: params?.method ?? "email",
    ...(params?.requires_confirmation ? { requires_confirmation: true } : {}),
  });
}

export function trackNewsletterSignup(source: string): void {
  trackEvent(GA_EVENTS.NEWSLETTER_SIGNUP, { source });
}

export function trackBlogSearch(params: { query_length: number; result_count: number }): void {
  trackEvent(GA_EVENTS.BLOG_SEARCH, params);
}

export function trackBlogCategoryView(params: { category_slug: string }): void {
  trackEvent(GA_EVENTS.BLOG_CATEGORY_VIEW, params);
}

export function trackToolUsed(tool: string): void {
  trackEvent(GA_EVENTS.TOOL_USED, { tool });
}

/** Reserved for a future contact form — no PII in params. */
export function trackContactSubmit(channel: string): void {
  trackEvent(GA_EVENTS.CONTACT_SUBMIT, { channel });
}
