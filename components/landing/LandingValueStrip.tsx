const BENEFITS = [
  {
    title: "Recover faster",
    copy: "See what is overdue, who owes you, and what to follow up next.",
  },
  {
    title: "Save time",
    copy: "Replace spreadsheet chasing with organized reminders and history.",
  },
  {
    title: "Stay in control",
    copy: "Track invoices, payments, risk, and collections in one place.",
  },
  {
    title: "Built to pay for itself",
    copy: "Recover one overdue invoice and FlowCollect can cover its plan.",
  },
] as const;

export function LandingValueStrip() {
  return (
    <section className="bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Cash Solved.
          </h2>
          <p className="mt-4 text-lg text-slate-300">
            FlowCollect helps turn overdue invoices into a clear follow-up process.
          </p>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {BENEFITS.map((item) => (
            <article
              key={item.title}
              className="rounded-xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm"
            >
              <h3 className="text-base font-semibold text-white">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-300">{item.copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
