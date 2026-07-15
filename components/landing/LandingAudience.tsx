const AUDIENCE = [
  {
    title: "Agencies",
    copy: "Deliver work. Get paid on time.",
    initial: "A",
  },
  {
    title: "Consultants",
    copy: "Focus on clients, not chasing payments.",
    initial: "C",
  },
  {
    title: "Service Businesses",
    copy: "Keep projects moving. Keep cash flowing.",
    initial: "S",
  },
  {
    title: "Freelancers",
    copy: "Look professional. Get paid faster.",
    initial: "F",
  },
  {
    title: "Small Teams",
    copy: "Simple, clear, effective collections.",
    initial: "T",
  },
] as const;

export function LandingAudience() {
  return (
    <section className="border-y border-slate-200 bg-slate-50 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-blue-700">
            Built for businesses that need better cash flow
          </p>
          <h2 className="mt-4 text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Built for teams that need stronger cash collection operations.
          </h2>
        </div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {AUDIENCE.map((item) => (
            <article
              key={item.title}
              className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md"
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 text-sm font-bold text-white">
                {item.initial}
              </div>
              <h3 className="mt-4 text-base font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{item.copy}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
