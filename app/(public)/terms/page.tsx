import { LegalDocument } from "@/components/public/LegalDocument";
import { PublicPageShell } from "@/components/public/PublicPageShell";
import { buildPublicPageMetadata } from "@/lib/public/pageMetadata";

export const metadata = buildPublicPageMetadata({
  title: "Arrexia Terms of Service | Usage Terms",
  description:
    "Read the terms governing your use of Arrexia, including accounts, workspaces, subscriptions, and acceptable use.",
  path: "/terms",
});

const SUPPORT_EMAIL = "support@arrexia.app";

export default function TermsPage() {
  return (
    <PublicPageShell>
      <main>
        <LegalDocument
          title="Terms of Service"
          lastUpdated="July 2, 2026"
          intro={
            <p>
              These Terms of Service (&ldquo;Terms&rdquo;) govern your access to and use of Arrexia
              at <a href="https://arrexia.app">arrexia.app</a>. By creating an account or using the
              service, you agree to these Terms.
            </p>
          }
          sections={[
            {
              id: "acceptance",
              title: "Acceptance of terms",
              content: (
                <p>
                  If you do not agree to these Terms, do not use Arrexia. If you use the service on
                  behalf of a company or organization, you represent that you have authority to bind
                  that entity to these Terms.
                </p>
              ),
            },
            {
              id: "about-arrexia",
              title: "About Arrexia",
              content: (
                <p>
                  Arrexia is a software platform for accounts receivable workflows, including invoice
                  tracking, payment visibility, reminders, and collections follow-up. Features may
                  change over time as the product evolves.
                </p>
              ),
            },
            {
              id: "user-accounts",
              title: "User accounts",
              content: (
                <p>
                  You are responsible for maintaining the confidentiality of your login credentials
                  and for all activity under your account. Provide accurate registration information
                  and notify us promptly if you suspect unauthorized access.
                </p>
              ),
            },
            {
              id: "workspace-data",
              title: "Workspace and business data",
              content: (
                <>
                  <p>
                    You may store business data in your workspace, including clients, invoices,
                    payments, reminders, and related records. You retain ownership of your business
                    data.
                  </p>
                  <p>
                    You are responsible for the accuracy of invoice amounts, client contact details,
                    payment records, and any communications sent through Arrexia. We do not verify
                    the legal or financial accuracy of your business data.
                  </p>
                </>
              ),
            },
            {
              id: "acceptable-use",
              title: "Acceptable use",
              content: (
                <>
                  <p>You agree not to misuse Arrexia. This includes, without limitation:</p>
                  <ul>
                    <li>Sending spam, harassing messages, or abusive payment reminders</li>
                    <li>Using the service for unlawful, fraudulent, or deceptive purposes</li>
                    <li>Attempting to access another user&apos;s workspace or data without permission</li>
                    <li>Interfering with the security, integrity, or availability of the platform</li>
                  </ul>
                  <p>
                    We may suspend or restrict access if we reasonably believe these rules have been
                    violated.
                  </p>
                </>
              ),
            },
            {
              id: "subscriptions",
              title: "Subscriptions and plans",
              content: (
                <>
                  <p>
                    Arrexia may offer Free, Starter, Pro, and Business plans with different feature
                    limits and pricing. Plan details, limits, and pricing are described on our
                    website and may be updated from time to time.
                  </p>
                  <p>
                    Paid subscriptions, billing cycles, and renewals will be described at checkout or
                    in your account settings when billing is enabled. Payment processing may be added
                    or changed in the future; applicable payment terms will be provided when that
                    happens.
                  </p>
                </>
              ),
            },
            {
              id: "cancellation",
              title: "Cancellation",
              content: (
                <p>
                  You may cancel a paid subscription according to the cancellation process available in
                  your account or by contacting support. Cancellation stops future billing but may
                  not entitle you to a refund for unused time unless required by applicable law or
                  stated in a separate agreement.
                </p>
              ),
            },
            {
              id: "intellectual-property",
              title: "Intellectual property",
              content: (
                <>
                  <p>
                    Arrexia owns the platform, software, branding, and related intellectual property.
                    These Terms do not transfer ownership of the service to you.
                  </p>
                  <p>
                    You retain ownership of the business data you upload or create in your workspace.
                    You grant us a limited license to host, process, and display that data solely to
                    operate and improve the service for you.
                  </p>
                </>
              ),
            },
            {
              id: "service-availability",
              title: "Service availability",
              content: (
                <p>
                  We aim to keep Arrexia available and reliable, but the service is provided on an
                  &ldquo;as available&rdquo; basis. Maintenance, updates, third-party outages, or
                  unforeseen issues may cause interruptions. We are not liable for temporary
                  unavailability except where required by law.
                </p>
              ),
            },
            {
              id: "disclaimer",
              title: "Disclaimer",
              content: (
                <p>
                  Arrexia is provided &ldquo;as is&rdquo; and &ldquo;as available&rdquo; without
                  warranties of any kind, whether express or implied, including implied warranties
                  of merchantability, fitness for a particular purpose, and non-infringement. We do
                  not guarantee that the service will meet your requirements or be error-free.
                </p>
              ),
            },
            {
              id: "limitation-of-liability",
              title: "Limitation of liability",
              content: (
                <p>
                  To the maximum extent permitted by law, Arrexia and its operators will not be
                  liable for indirect, incidental, special, consequential, or punitive damages, or
                  for loss of profits, revenue, data, or business opportunities arising from your
                  use of the service. Our total liability for any claim related to the service is
                  limited to the amount you paid us for the service in the twelve months before the
                  claim, or one hundred U.S. dollars if you have not paid us, whichever is greater.
                </p>
              ),
            },
            {
              id: "termination",
              title: "Termination",
              content: (
                <p>
                  You may stop using Arrexia at any time. We may suspend or terminate access if you
                  violate these Terms, if required by law, or if we discontinue the service. Upon
                  termination, your right to use the platform ends, subject to any data export or
                  retention policies in effect at the time.
                </p>
              ),
            },
            {
              id: "changes",
              title: "Changes to terms",
              content: (
                <p>
                  We may update these Terms from time to time. If we make material changes, we will
                  provide notice through the service or by email where appropriate. Continued use
                  after changes become effective constitutes acceptance of the updated Terms.
                </p>
              ),
            },
            {
              id: "governing-law",
              title: "Governing law",
              content: (
                <p>
                  These Terms are governed by the laws of Jordan, without regard to conflict of law
                  principles, unless updated after company incorporation in another jurisdiction.
                </p>
              ),
            },
            {
              id: "contact",
              title: "Contact",
              content: (
                <p>
                  Questions about these Terms can be sent to{" "}
                  <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
                </p>
              ),
            },
          ]}
        />
      </main>
    </PublicPageShell>
  );
}
