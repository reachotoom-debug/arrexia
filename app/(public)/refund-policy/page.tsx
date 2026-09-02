import Link from "next/link";
import { LegalDocument } from "@/components/public/LegalDocument";
import { PublicPageShell } from "@/components/public/PublicPageShell";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata("refund-policy");

const SUPPORT_EMAIL = "support@arrexia.app";

export default function RefundPolicyPage() {
  return (
    <PublicPageShell>
      <main>
        <LegalDocument
          title="Refund Policy"
          lastUpdated="September 3, 2026"
          intro={
            <p>
              This Refund Policy explains the cancellation and refund terms that apply to paid
              Arrexia subscriptions purchased through <a href="https://arrexia.app">arrexia.app</a>.
            </p>
          }
          sections={[
            {
              id: "subscriptions",
              title: "Subscription billing",
              content: (
                <p>
                  Arrexia offers paid subscription plans that may be billed monthly or annually.
                  Subscription pricing and the applicable billing period are displayed before you
                  complete your purchase.
                </p>
              ),
            },
            {
              id: "payment-processing",
              title: "Payment processing",
              content: (
                <p>
                  Paid Arrexia subscription purchases processed through Paddle are sold by Paddle,
                  which acts as the Merchant of Record and authorized reseller for those
                  transactions. Paddle processes the payment and provides applicable
                  payment-related buyer support.
                </p>
              ),
            },
            {
              id: "cancellation",
              title: "Cancellation",
              content: (
                <>
                  <p>
                    You may cancel your paid subscription through the subscription management
                    options available in your Arrexia account or through the applicable Paddle
                    customer portal.
                  </p>
                  <p>
                    Cancellation prevents future renewal and normally takes effect at the end of
                    your current paid billing period, unless applicable law requires otherwise.
                    You may continue using the paid service until the end of that period, subject
                    to these Terms and any applicable service restrictions.
                  </p>
                </>
              ),
            },
            {
              id: "refunds",
              title: "Refunds",
              content: (
                <>
                  <p>
                    Payments are generally non-refundable, including for unused portions of a
                    subscription period, except where a refund is required by applicable law or
                    otherwise approved through the applicable payment and refund process.
                  </p>
                  <p>
                    Refund requests relating to purchases processed by Paddle are handled under
                    Paddle&apos;s applicable buyer support and refund process. Mandatory statutory
                    rights available to you under applicable law are not affected by this policy.
                  </p>
                </>
              ),
            },
            {
              id: "service-access",
              title: "Service access after a refund",
              content: (
                <p>
                  If a payment is refunded, reversed, or otherwise returned, access to the
                  corresponding paid subscription or paid features may be adjusted or terminated
                  as appropriate.
                </p>
              ),
            },
            {
              id: "related-terms",
              title: "Related terms",
              content: (
                <p>
                  This Refund Policy should be read together with our{" "}
                  <Link href="/terms">Terms of Service</Link> and{" "}
                  <Link href="/privacy">Privacy Policy</Link>.
                </p>
              ),
            },
            {
              id: "contact",
              title: "Contact",
              content: (
                <p>
                  If you need assistance with a subscription, cancellation, or refund request,
                  contact us at{" "}
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
