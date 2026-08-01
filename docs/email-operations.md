# Arrexia email operations

Operational guide for Arrexia sending identity and inbound mail routing. The application centralizes outbound identities in `lib/email/identities.ts`. Real mailboxes and aliases are configured outside the codebase.

## Launch sending identity

Application-generated transactional email uses one authenticated From identity:

```
Arrexia <hello@arrexia.app>
```

Category-specific Reply-To addresses route replies to the correct team:

| Category | Reply-To |
|---|---|
| Authentication (Supabase Auth) | `support@arrexia.app` |
| Invoice delivery / billing notifications | `billing@arrexia.app` |
| Payment reminders / collections | `collections@arrexia.app` |
| Sales / demo enquiries | `sales@arrexia.app` |
| General website enquiries | `hello@arrexia.app` |
| Support | `support@arrexia.app` |

## Inbound addresses required outside the app

These addresses must exist operationally before launch. They may be real mailboxes or aliases forwarding to the operational inbox:

- `hello@arrexia.app`
- `support@arrexia.app`
- `billing@arrexia.app`
- `collections@arrexia.app`
- `sales@arrexia.app`

All five may initially forward to one protected operational inbox.

## Deployment gate — do not deploy without this

**Application deployment must not go to production until one of these is configured in the deployment environment:**

```bash
ARREXIA_EMAIL_FROM="Arrexia <hello@arrexia.app>"
# or backward-compatible alias:
EMAIL_FROM="Arrexia <hello@arrexia.app>"
```

Preferred value: `ARREXIA_EMAIL_FROM="Arrexia <hello@arrexia.app>"`.

Production sends fail closed when neither variable is set. Do not add a fallback to `noreply@arrexia.app` or a personal inbox address.

## Deployment gate — inbound aliases before Reply-To routing

**Do not enable category Reply-To routing in production until all five inbound aliases exist and have been tested:**

- `hello@arrexia.app`
- `support@arrexia.app`
- `billing@arrexia.app`
- `collections@arrexia.app`
- `sales@arrexia.app`

Until aliases are verified, replies to invoice, reminder, and auth mail may not reach anyone even if outbound delivery succeeds.

Each alias must be tested by sending a real inbound message and replying. All five may forward to one protected operational inbox for launch.

## Important distinctions

1. **Resend domain verification** proves sending authorization. It does not create inboxes.
2. **Resend Receiving** is optional. Do not enable it unless Arrexia needs programmatic inbound processing.
3. Inbound mail may be handled by Cloudflare Email Routing, Google Workspace, Zoho Mail, Microsoft 365, or another provider.
4. Do not add conflicting MX records without understanding the existing `send.arrexia.app` Resend MAIL FROM record.
5. The `send.arrexia.app` MX record supports sending/return-path infrastructure. It is not necessarily an inbox for `@arrexia.app`.
6. Test each alias by sending a real inbound message and replying.

## Launch checklist (manual)

For each alias (`hello`, `support`, `billing`, `collections`, `sales`):

- [ ] Alias or mailbox exists
- [ ] Forwards successfully to the operational inbox
- [ ] Reply from the operational inbox works
- [ ] SPF / DKIM / DMARC still pass on outbound mail
- [ ] No forwarding loop
- [ ] No catch-all unless intentionally enabled
- [ ] Operational inbox protected with MFA

## Application contact flows today

The public Contact page uses `mailto:` links only. There is no server-side contact-form sender yet.

| Channel | Destination |
|---|---|
| General enquiries and partnerships | `hello@arrexia.app` |
| Technical support | `support@arrexia.app` |
| Enterprise / Contact Sales | `sales@arrexia.app` |

Contact Sales / Enterprise CTAs use `getEnterpriseContactHref()` and open `mailto:sales@arrexia.app`.

When a server-side form is added:

- Internal notification → `ARREXIA_EMAIL_TO_GENERAL` or `ARREXIA_EMAIL_TO_SALES`
- Reply-To → validated submitter email only
- From → always the authenticated Arrexia transactional identity

Never use a visitor address as the SMTP/Resend `From` header.

## Supabase Auth email

Authentication email is configured in the Supabase Dashboard (SMTP), not via `RESEND_API_KEY`.

Recommended dashboard fields:

| Field | Value |
|---|---|
| Sender name | `Arrexia` |
| Sender email | `hello@arrexia.app` |
| Reply-To (if supported) | `support@arrexia.app` |

See `docs/authentication-email-branding.md` for template sync and redirect configuration.
