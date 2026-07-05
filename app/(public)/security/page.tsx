import { LegalDocument } from "@/components/public/LegalDocument";
import { PublicPageShell } from "@/components/public/PublicPageShell";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata("security");

const SUPPORT_EMAIL = "support@arrexia.app";

export default function SecurityPage() {
  return (
    <PublicPageShell>
      <main>
        <LegalDocument
          title="Security at Arrexia"
          lastUpdated="July 2, 2026"
          intro={
            <p>
              Security is built into how Arrexia operates. This page explains, in plain language, how
              we protect your account, workspace data, and the infrastructure that powers the service.
              We do not claim certifications we have not earned.
            </p>
          }
          sections={[
            {
              id: "overview",
              title: "Overview",
              content: (
                <p>
                  Arrexia is designed for businesses that store sensitive client, invoice, and payment
                  information. We use industry-standard practices appropriate to our infrastructure and
                  stage, including authenticated access, encrypted connections, and provider-level
                  safeguards.
                </p>
              ),
            },
            {
              id: "authentication",
              title: "Authentication through Supabase Auth",
              content: (
                <>
                  <p>
                    User accounts are managed through Supabase Auth. Passwords are handled using
                    secure authentication flows rather than being stored in plain text by Arrexia
                    application code.
                  </p>
                  <h3>Email verification</h3>
                  <p>
                    Email verification helps confirm account ownership and reduces the risk of
                    unauthorized sign-ups or account takeover.
                  </p>
                </>
              ),
            },
            {
              id: "access-controls",
              title: "Workspace-based access controls",
              content: (
                <>
                  <p>
                    Data in Arrexia is organized by workspace. Users should only access workspaces
                    they belong to, and product features are scoped to the active workspace context.
                  </p>
                  <h3>Row Level Security</h3>
                  <p>
                    Where applicable, Supabase Row Level Security (RLS) policies help ensure database
                    queries can only return rows a signed-in user is permitted to access. This adds a
                    database-layer check in addition to application logic.
                  </p>
                </>
              ),
            },
            {
              id: "transport-security",
              title: "HTTPS and network security",
              content: (
                <p>
                  Arrexia is served over HTTPS. Traffic between your browser and our application is
                  encrypted in transit. Hosting and edge infrastructure on Vercel (and related CDN or
                  protection layers such as Cloudflare where configured) help deliver the application
                  securely and reliably.
                </p>
              ),
            },
            {
              id: "secrets",
              title: "Environment variables and secrets",
              content: (
                <p>
                  API keys, database credentials, and other secrets are stored as environment variables
                  rather than in source code. Access to production configuration is limited to
                  authorized operators and deployment systems.
                </p>
              ),
            },
            {
              id: "email",
              title: "Transactional email through Resend",
              content: (
                <p>
                  Invoice, reminder, and account emails are sent through Resend using configured sender
                  identities. Email content is limited to what is needed for the specific transactional
                  purpose.
                </p>
              ),
            },
            {
              id: "data-handling",
              title: "Data handling",
              content: (
                <p>
                  Business data you enter — clients, invoices, payments, reminders, and notes — is
                  stored in our database infrastructure and used only to provide the service. We do
                  not sell your business data.
                </p>
              ),
            },
            {
              id: "backups",
              title: "Backups and provider infrastructure",
              content: (
                <p>
                  Database hosting through Supabase includes provider-managed infrastructure, monitoring,
                  and backup capabilities. While no system is immune to failure, we rely on established
                  cloud providers rather than self-managed servers.
                </p>
              ),
            },
            {
              id: "responsible-disclosure",
              title: "Responsible disclosure",
              content: (
                <p>
                  If you believe you have found a security vulnerability, please report it responsibly to{" "}
                  <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. Include enough detail for us
                  to investigate. We appreciate good-faith reports and will work to address confirmed
                  issues promptly.
                </p>
              ),
            },
          ]}
        />
      </main>
    </PublicPageShell>
  );
}
