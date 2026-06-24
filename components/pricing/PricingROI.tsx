export function PricingROI() {
  return (
    <section className="space-y-10 lg:space-y-12">
      <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm lg:p-12">
        <div className="mx-auto max-w-3xl space-y-8 text-center">
          <h2 className="text-2xl font-semibold text-slate-900 sm:text-3xl lg:text-4xl">
            FlowCollect pays for itself
          </h2>
          <p className="text-base leading-relaxed text-slate-600 sm:text-lg">
            If FlowCollect helps you recover just one overdue invoice faster, the
            subscription can already pay for itself.
          </p>

          <div className="grid gap-4 text-left sm:grid-cols-2">
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-5">
              <p className="text-sm font-medium text-blue-700">Starter</p>
              <p className="mt-1 text-sm text-slate-700 sm:text-base">
                Recover a $500 invoice faster → Starter justified.
              </p>
            </div>
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-5">
              <p className="text-sm font-medium text-blue-700">Pro</p>
              <p className="mt-1 text-sm text-slate-700 sm:text-base">
                Recover a $2,000 client payment sooner → Pro becomes insignificant.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl space-y-4 text-center">
        <h3 className="text-xl font-semibold text-slate-900 sm:text-2xl lg:text-3xl">
          This isn&apos;t invoicing software.
        </h3>
        <p className="text-base leading-relaxed text-slate-600 sm:text-lg">
          FlowCollect focuses on collections, reminders, payment tracking, and cash
          recovery — helping businesses get paid faster.
        </p>
      </div>
    </section>
  );
}
