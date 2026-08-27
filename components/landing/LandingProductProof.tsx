import { Mail, MessageCircle, Sparkles } from "lucide-react";
import { ProductScreenshot } from "./ProductScreenshot";

const WORKFLOW_STEPS = [
  {
    step: "2",
    label: "Prioritize",
    title: "Focus on the receivables that matter most",
    copy: "Collections brings outstanding balances, aging and risk context together — so your team prioritizes follow-up instead of manually searching through invoices.",
    src: "/product/collections.png",
    alt: "Arrexia Collections view showing overdue exposure, risk levels, aging context, and portfolio actions for high-priority accounts",
    width: 1916,
    height: 912,
  },
  {
    step: "3",
    label: "Act",
    title: "Turn collection context into action with AI",
    copy: "Draft context-aware collection messages with Arrexia AI, choose the right tone, review the message and continue through Email or WhatsApp.",
    src: "/product/ai-assist.png",
    alt: "Arrexia AI Collection Assistant drafting a professional reminder with human review before Email or WhatsApp follow-up",
    width: 1916,
    height: 899,
  },
] as const;

const ACT_CAPABILITIES = [
  { label: "AI-assisted drafting", icon: Sparkles },
  { label: "Email follow-up", icon: Mail },
  { label: "WhatsApp follow-up", icon: MessageCircle },
] as const;

export function LandingProductProof() {
  return (
    <section
      id="product-proof"
      className="scroll-mt-24 border-y border-slate-200 bg-white py-20 sm:py-24"
      aria-labelledby="product-proof-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
            Prioritize → Act
          </p>
          <h2
            id="product-proof-heading"
            className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl"
          >
            From prioritized accounts to the next follow-up.
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-slate-600">
            Once you know what needs attention, Arrexia helps you rank receivables by risk and
            outstanding exposure — then move into reviewed, context-aware follow-up.
          </p>
          <p className="mt-3 text-sm font-medium text-slate-700">
            One workflow from insight to follow-up.
          </p>
        </div>

        <ol className="mt-16 space-y-20 sm:mt-20 sm:space-y-24">
          {WORKFLOW_STEPS.map((item) => (
            <li
              key={item.step}
              className="grid gap-8 lg:grid-cols-[minmax(0,34%)_minmax(0,66%)] lg:items-start lg:gap-10 xl:gap-12"
            >
              <div className="lg:max-w-md lg:pt-2">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-violet-700">
                  Step {item.step} — {item.label}
                </p>
                <h3 className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl">
                  {item.title}
                </h3>
                <p className="mt-4 text-base leading-relaxed text-slate-600">{item.copy}</p>

                {item.label === "Act" ? (
                  <ul className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                    {ACT_CAPABILITIES.map(({ label, icon: Icon }) => (
                      <li
                        key={label}
                        className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-sm font-medium text-slate-700"
                      >
                        <Icon className="h-4 w-4 shrink-0 text-blue-600" aria-hidden="true" />
                        {label}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>

              <ProductScreenshot
                src={item.src}
                alt={item.alt}
                width={item.width}
                height={item.height}
                sizes="(max-width: 1024px) 100vw, 68vw"
                className="min-w-0 lg:justify-self-stretch"
              />
            </li>
          ))}
        </ol>

        <p className="mx-auto mt-16 max-w-2xl text-center text-sm font-medium text-slate-700 sm:mt-20">
          Prioritize. Personalize. Follow up.
        </p>
      </div>
    </section>
  );
}
