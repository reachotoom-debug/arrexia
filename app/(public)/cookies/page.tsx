import Link from "next/link";
import { LegalDocument } from "@/components/public/LegalDocument";
import { PublicPageShell } from "@/components/public/PublicPageShell";
import { buildPageMetadata } from "@/lib/seo/metadata";

export const metadata = buildPageMetadata("cookies");

const SUPPORT_EMAIL = "support@arrexia.app";

export default function CookiesPage() {
  return (
    <PublicPageShell>
      <main>
        <LegalDocument
          title="Cookie Policy"
          lastUpdated="July 2, 2026"
          intro={
            <p>
              This Cookie Policy explains how Arrexia uses cookies and similar technologies when you
              visit <a href="https://arrexia.app">arrexia.app</a> or use our application.
            </p>
          }
          sections={[
            {
              id: "what-cookies-are",
              title: "What cookies are",
              content: (
                <p>
                  Cookies are small text files stored on your device by your browser. They help
                  websites remember information about your visit, such as login state or preferences.
                  Similar technologies, such as local storage, may be used for comparable purposes.
                </p>
              ),
            },
            {
              id: "essential-cookies",
              title: "Essential cookies",
              content: (
                <>
                  <p>
                    We use essential cookies and session storage to operate the service. These are
                    required for core functionality and generally cannot be disabled without affecting
                    how the product works.
                  </p>
                  <h3>Authentication and session cookies</h3>
                  <p>
                    When you sign in, cookies and session tokens help keep you authenticated, protect
                    your account, and route requests to the correct workspace.
                  </p>
                  <h3>Preferences</h3>
                  <p>
                    We may store basic preferences, such as UI settings, to provide a consistent
                    experience during your session.
                  </p>
                </>
              ),
            },
            {
              id: "analytics",
              title: "Analytics cookies",
              content: (
                <p>
                  We may add analytics cookies in the future to understand product usage and improve
                  reliability. If we do, we will update this policy and, where required, ask for
                  consent before using non-essential analytics cookies.
                </p>
              ),
            },
            {
              id: "third-party",
              title: "Third-party cookies",
              content: (
                <p>
                  Some infrastructure providers used to host or deliver Arrexia may set their own
                  cookies or collect technical data as part of providing their services. Their use is
                  governed by their respective policies.
                </p>
              ),
            },
            {
              id: "managing-cookies",
              title: "Managing cookies",
              content: (
                <>
                  <p>
                    Most browsers let you block or delete cookies through their settings. If you block
                    essential cookies, parts of Arrexia — especially signed-in areas — may not work
                    correctly.
                  </p>
                  <p>
                    For more about how we handle personal data, see our{" "}
                    <Link href="/privacy">Privacy Policy</Link>.
                  </p>
                </>
              ),
            },
            {
              id: "contact",
              title: "Contact",
              content: (
                <p>
                  Questions about this Cookie Policy can be sent to{" "}
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
