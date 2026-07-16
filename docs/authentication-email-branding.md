# Authentication Email Branding

This document describes how Arrexia handles authentication emails versus application transactional emails, and what must be configured in the Supabase Dashboard for production.

## Who sends which emails

| Email type | Sender | Templates |
|------------|--------|-----------|
| Signup confirmation | **Supabase Auth** | Supabase Dashboard |
| Password reset | **Supabase Auth** | Supabase Dashboard |
| Invoice delivery | **Resend** (application) | `lib/email/templates.ts` |
| Payment reminders | **Resend** (application) | `lib/email/templates.ts` |
| Newsletter welcome | **Resend** (application) | `lib/email/templates.ts` |

**Supabase sends authentication emails.** The application calls `supabase.auth.signUp`, `resetPasswordForEmail`, and `auth.resend`; Supabase generates and delivers those messages.

**Resend sends application emails.** Invoice, reminder, and newsletter mail go through `lib/email/sendEmail.ts` using `RESEND_API_KEY` and `EMAIL_FROM`.

Resend is **not** wired to authentication flows in application code.

## Repository reference templates

Version-controlled HTML reference templates live in:

```
supabase/templates/
  confirm-signup.html
  reset-password.html
```

These files are **not** automatically deployed to Supabase. They document the intended Arrexia branding and should be copied manually into the Supabase Dashboard when updating auth email templates.

Each file includes a header comment:

> Reference template for manual synchronization with Supabase Dashboard.

Placeholder variables (for example `{{ confirmation_url }}`, `{{ reset_url }}`, `{{ user_email }}`) are illustrative. Use the exact variable names shown in the Supabase Dashboard template editor when copying content.

## Supabase Dashboard configuration (required for production)

### 1. Authentication → URL Configuration

| Setting | Production value |
|---------|----------------|
| Site URL | `https://arrexia.app` |
| Redirect URLs | `https://arrexia.app/auth/callback` |
| | `https://arrexia.app/auth/callback?next=/reset-password` |
| Local QA (optional) | `http://localhost:3000/auth/callback` |
| | `http://127.0.0.1:3000/auth/callback` |
| | `http://localhost:3000/auth/callback?next=/reset-password` |

The application callback route is `/auth/callback`. Password recovery links include `?next=/reset-password` and must be allowlisted.

### 2. Authentication → Email Templates

Copy HTML from `supabase/templates/` into:

- **Confirm signup** — `confirm-signup.html`
- **Reset password** — `reset-password.html`

Update subject lines to match Arrexia branding (for example, “Confirm your Arrexia account”, “Reset your Arrexia password”).

### 3. Project Settings → Authentication → SMTP (or Authentication → SMTP)

Configure custom SMTP so auth emails send from the Arrexia domain instead of Supabase defaults.

Recommended production sender:

| Field | Value |
|-------|-------|
| Sender name | `Arrexia` |
| Sender email | `noreply@arrexia.app` |

Resend provides SMTP credentials that can be used here. This is configured **only in the Supabase Dashboard** — not in application environment variables.

### 4. Authentication → Providers

- Enable **Confirm email** for production if email verification is required.
- Configure **Google** OAuth if `NEXT_PUBLIC_ENABLE_SOCIAL_AUTH=true`.

### 5. Authentication → Rate Limits

Review email send rate limits before launch. Local `supabase/config.toml` defaults are not authoritative for hosted production.

## Application redirect behavior

Client-initiated auth redirects (signup confirmation, password reset, OAuth) use the **current browser origin** when available via `getClientAppOrigin()` in `lib/config/appUrl.ts`. This keeps localhost, production, and Vercel preview deployments aligned with the URL the user is actually on.

Fallback order when the browser origin is unavailable:

1. `NEXT_PUBLIC_APP_URL`
2. `http://localhost:3000` (development)
3. `https://{VERCEL_URL}` (Vercel preview)
4. `https://arrexia.app` (production default)

Password reset links route through `/auth/callback?next=/reset-password` for PKCE, then redirect to `/reset-password`.

## Environment variables (application email only)

| Variable | Purpose |
|----------|---------|
| `RESEND_API_KEY` | Resend API for invoices, reminders, newsletter |
| `EMAIL_FROM` | Application sender (default `Arrexia <noreply@arrexia.app>`) |
| `NEXT_PUBLIC_APP_URL` | Fallback app URL for server-side URL building |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |

Auth email delivery does not use `RESEND_API_KEY` or `EMAIL_FROM` in application code.

## Launch checklist

1. Copy templates from `supabase/templates/` into Supabase Dashboard email templates.
2. Configure custom SMTP in Supabase (Resend recommended) with `noreply@arrexia.app`.
3. Set Site URL and redirect allowlist in Supabase URL Configuration.
4. Enable email confirmation in Supabase if required for production.
5. Send test signup and password-reset emails; confirm Arrexia branding and sender.
6. Verify links land on `/auth/callback` and complete PKCE session exchange.
