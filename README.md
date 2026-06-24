This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.

## Social authentication

FlowCollect supports Google OAuth via Supabase Auth.

- **Google provider:** `google`
- **UI toggle:** set `NEXT_PUBLIC_ENABLE_SOCIAL_AUTH=false` to hide the Google login button

Enable Google in the [Supabase Dashboard](https://supabase.com/dashboard) under Authentication → Providers.

OAuth callback URL: `{YOUR_SITE_URL}/auth/callback`

## Transactional email (Resend)

FlowCollect sends invoice and reminder emails through [Resend](https://resend.com) when `RESEND_API_KEY` is set.

Copy `.env.example` to `.env.local` and configure:

```bash
RESEND_API_KEY=re_...
EMAIL_FROM=onboarding@resend.dev
CRON_SECRET=your-random-secret
```

### Local testing (before domain verification)

1. Create a Resend account and API key.
2. Set `EMAIL_FROM=onboarding@resend.dev`.
3. **Sandbox limit:** Resend only delivers to the email address that owns the Resend account until your domain is verified.
4. In Settings → Email, click **Send Test Email** (delivers to your logged-in account email).
5. Send invoice/reminder emails only to that same address while testing.

### Production (after verifying flowcollect.app)

1. Verify `flowcollect.app` in the Resend dashboard.
2. Set `EMAIL_FROM=noreply@flowcollect.app`.
3. Optionally set workspace **From name** / **From email** in Settings → Email.

SMTP remains available as an optional fallback when a workspace explicitly selects **Custom SMTP** in settings.
