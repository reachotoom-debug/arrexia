import { LegalDocument } from "@/components/public/LegalDocument";
import { PublicPageShell } from "@/components/public/PublicPageShell";
import { buildPublicPageMetadata } from "@/lib/public/pageMetadata";

export const metadata = buildPublicPageMetadata({
  title: "Arrexia Privacy Policy | Data Protection & Privacy",
  description:
    "Learn how Arrexia collects, uses, and protects your account, business, and technical data.",
  path: "/privacy",
});

const SUPPORT_EMAIL = "support@arrexia.app";

export default function PrivacyPage() {
  return (
    <PublicPageShell>
      <main>
        <LegalDocument
          title="Privacy Policy"
          lastUpdated="July 2, 2026"
          intro={
            <>
              <p>
                Arrexia (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates{" "}
                <a href="https://arrexia.app">arrexia.app</a>, an accounts receivable platform for
                invoice tracking, payment reminders, and cash flow visibility. This Privacy Policy
                explains what information we collect, how we use it, and the choices available to
                you.
              </p>
            </>
          }
          sections={[
            {
              id: "information-we-collect",
              title: "Information we collect",
              content: (
                <>
                  <h3>Account information</h3>
                  <p>
                    When you create an account or workspace, we collect information such as your
                    name, email address, and company or workspace name. This information is used to
                    authenticate you and operate your account.
                  </p>
                  <h3>Business data</h3>
                  <p>
                    When you use Arrexia, you may store business data in your workspace, including
                    client records, invoices, payments, reminder settings and history, and
                    collections notes. You control this data and it is used to provide the
                    product features you request.
                  </p>
                  <h3>Technical data</h3>
                  <p>
                    We and our infrastructure providers may collect technical information such as
                    browser type, device information, IP address, and server or application logs.
                    This data helps us maintain security, diagnose issues, and improve reliability.
                  </p>
                </>
              ),
            },
            {
              id: "how-we-use-information",
              title: "How we use information",
              content: (
                <>
                  <ul>
                    <li>
                      <strong>Authentication and account management</strong> — to sign you in,
                      verify your email, manage workspace access, and protect your account.
                    </li>
                    <li>
                      <strong>Providing product functionality</strong> — to operate invoice
                      tracking, payment recording, reminder workflows, dashboards, exports, and
                      related features within your workspace.
                    </li>
                    <li>
                      <strong>Transactional email</strong> — to send account, invoice, reminder,
                      and other service-related emails through our email provider, Resend.
                    </li>
                    <li>
                      <strong>Reliability and support</strong> — to monitor performance, troubleshoot
                      issues, respond to support requests, and improve the product over time.
                    </li>
                  </ul>
                </>
              ),
            },
            {
              id: "third-party-services",
              title: "Third-party services",
              content: (
                <>
                  <p>Arrexia relies on trusted providers to operate the service, including:</p>
                  <ul>
                    <li>
                      <strong>Supabase</strong> — authentication, database, and related backend
                      infrastructure.
                    </li>
                    <li>
                      <strong>Vercel</strong> — application hosting and delivery.
                    </li>
                    <li>
                      <strong>Resend</strong> — delivery of transactional emails.
                    </li>
                  </ul>
                  <p>
                    Payment processing providers may be added in the future. If that happens, we
                    will update this policy to describe how payment information is handled.
                  </p>
                </>
              ),
            },
            {
              id: "cookies-and-sessions",
              title: "Cookies and sessions",
              content: (
                <>
                  <p>
                    We use cookies and similar technologies to keep you signed in, maintain session
                    state, and support core product functionality. For more detail, see our{" "}
                    <a href="/cookies">Cookie Policy</a>.
                  </p>
                </>
              ),
            },
            {
              id: "data-retention",
              title: "Data retention",
              content: (
                <>
                  <p>
                    We retain account and workspace data for as long as your account is active or as
                    needed to provide the service. If you delete your account or request deletion,
                    we will remove or anonymize data within a reasonable period, subject to legal
                    obligations and backup retention cycles.
                  </p>
                </>
              ),
            },
            {
              id: "data-security",
              title: "Data security",
              content: (
                <>
                  <p>
                    We use administrative, technical, and organizational measures designed to protect
                    your information, including access controls, encrypted connections, and secure
                    handling of secrets. No method of transmission or storage is completely secure,
                    but we work to safeguard data using industry-standard practices appropriate to
                    our stage and infrastructure.
                  </p>
                  <p>
                    Learn more on our <a href="/security">Security</a> page.
                  </p>
                </>
              ),
            },
            {
              id: "user-rights",
              title: "Your rights",
              content: (
                <>
                  <p>Depending on your location, you may have the right to:</p>
                  <ul>
                    <li>Access the personal information we hold about you</li>
                    <li>Request correction of inaccurate information</li>
                    <li>Request deletion of your account and associated personal data</li>
                  </ul>
                  <p>
                    To make a request, contact us at{" "}
                    <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>. We may need to verify
                    your identity before processing certain requests.
                  </p>
                </>
              ),
            },
            {
              id: "contact",
              title: "Contact",
              content: (
                <>
                  <p>
                    Questions about this Privacy Policy can be sent to{" "}
                    <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
                  </p>
                </>
              ),
            },
          ]}
          disclaimer="This policy is provided for general informational purposes and should be reviewed by legal counsel before commercial use."
        />
      </main>
    </PublicPageShell>
  );
}
