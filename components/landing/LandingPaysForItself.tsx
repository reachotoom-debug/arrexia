const STATEMENTS = [
  <>
    Recover just <span className="font-semibold text-cyan-200">one overdue invoice</span> and the
    plan can cover itself.
  </>,
  <>Stop leaving money on the table.</>,
  <>
    Strong follow-up. <span className="font-semibold text-cyan-200">Faster payments</span>.
    Healthier cash flow.
  </>,
  <>
    <span className="font-semibold text-cyan-200">No setup fees</span>. No surprises.
  </>,
] as const;

export function LandingPaysForItself() {
  return (
    <section className="bg-gradient-to-br from-slate-950 via-blue-950 to-slate-900 py-16 sm:py-20">
      <div className="mx-auto max-w-5xl px-4 sm:px-6">
        <div className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Arrexia{" "}
            <span className="bg-gradient-to-r from-blue-300 to-cyan-200 bg-clip-text text-transparent">
              pays for itself.
            </span>
          </h2>
        </div>

        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {STATEMENTS.map((statement, index) => (
            <li
              key={index}
              className="rounded-xl border border-white/10 bg-white/5 px-5 py-4 text-base leading-relaxed text-slate-100 backdrop-blur-sm"
            >
              {statement}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
