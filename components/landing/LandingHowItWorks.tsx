import Link from "next/link";

const STEPS = [
  {
    step: "1",
    title: "See what needs attention today",
    description:
      "Daily Action Center surfaces prioritized collection actions from your receivables — overdue balances, follow-ups due, and accounts at risk.",
  },
  {
    step: "2",
    title: "Prioritize overdue accounts",
    description:
      "Use collections views and AI-assisted message drafts to decide the next follow-up for each client and invoice.",
  },
  {
    step: "3",
    title: "Follow up and track recovery",
    description:
      "Send email or WhatsApp reminders, record payments, and monitor cash flow as overdue receivables turn into collected cash.",
  },
] as const;

export function LandingHowItWorks() {
  return (
    <section
      id="how-it-works"
      className="scroll-mt-24 bg-slate-50 py-20 sm:py-24"
      aria-labelledby="how-it-works-heading"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 id="how-it-works-heading" className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            How it works
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            From overdue visibility to prioritized follow-up and payment recovery — without the
            spreadsheet chaos. Questions? Visit our{" "}
            <Link href="/contact" className="font-medium text-blue-700 hover:text-blue-800">
              contact page
            </Link>
            .
          </p>
        </div>

        <ol className="mt-14 grid gap-6 lg:grid-cols-3">
          {STEPS.map((item) => (
            <li
              key={item.step}
              className="relative rounded-2xl border border-slate-200 bg-white p-8 shadow-sm"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-sm font-bold text-white">
                {item.step}
              </span>
              <h3 className="mt-5 text-xl font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">{item.description}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
