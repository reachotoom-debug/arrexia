const STEPS = [
  {
    step: "1",
    title: "Add clients and invoices",
    description:
      "Import or create clients, issue invoices, and keep every balance in one organized workspace.",
  },
  {
    step: "2",
    title: "Track payments and overdue balances",
    description:
      "See paid, outstanding, and overdue amounts at a glance with dashboards built for AR teams.",
  },
  {
    step: "3",
    title: "Send reminders and recover cash",
    description:
      "Use smart reminders and collections workflows to follow up consistently and get paid sooner.",
  },
] as const;

export function LandingHowItWorks() {
  return (
    <section id="how-it-works" className="scroll-mt-24 bg-slate-50 py-20 sm:py-24">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            How it works
          </h2>
          <p className="mt-4 text-lg text-slate-600">
            A simple flow from invoice to reminder to payment — without the spreadsheet chaos.
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
