const FAQ_ITEMS = [
  {
    question: "Is Arrexia accounting or invoicing software?",
    answer:
      "No. Arrexia is an AI-powered accounts receivable and collections platform. Invoices and payments support the workflow — the product focus is overdue visibility, prioritized follow-up, reminders, and cash recovery.",
  },
  {
    question: "Can I send invoice reminders by email?",
    answer:
      "Yes. Arrexia supports automated reminder schedules and manual email follow-up for due and overdue receivables, with a clear history of what was sent.",
  },
  {
    question: "Do I need Stripe or a payment processor?",
    answer:
      "No. Arrexia helps you track receivables, prioritize collections, and follow up on overdue invoices. You record payments in Arrexia — it does not process card payments natively.",
  },
  {
    question: "Can I change plans later?",
    answer:
      "Yes. You can move between Starter, Pro, and Business as your client and invoice volume grows. Enterprise plans are available via Contact Sales.",
  },
  {
    question: "Can I get started for free?",
    answer:
      "Yes. Create a free Arrexia account with no credit card required. You can upgrade to Starter, Pro, or Business when your business needs more capacity.",
  },
] as const;

export function LandingFAQ() {
  return (
    <section id="faq" className="scroll-mt-24 bg-slate-50 py-20 sm:py-24">
      <div className="mx-auto max-w-3xl px-4 sm:px-6">
        <div className="text-center">
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">
            Frequently asked questions
          </h2>
        </div>

        <dl className="mt-12 space-y-4">
          {FAQ_ITEMS.map((item) => (
            <div
              key={item.question}
              className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
            >
              <dt>
                <h3 className="text-base font-semibold text-slate-900">{item.question}</h3>
              </dt>
              <dd className="mt-2 text-sm leading-relaxed text-slate-600">{item.answer}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}
