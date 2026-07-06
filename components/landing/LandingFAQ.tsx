const FAQ_ITEMS = [
  {
    question: "Is Arrexia a replacement for accounting software?",
    answer:
      "No. Arrexia focuses on invoice collection, accounts receivable, reminders, and cash flow visibility. It complements your accounting stack rather than replacing it.",
  },
  {
    question: "Can I send invoice reminders by email?",
    answer:
      "Yes. Arrexia supports reminder workflows and email templates so you can follow up on due and overdue invoices consistently.",
  },
  {
    question: "Do I need Stripe?",
    answer:
      "Arrexia does not require Stripe to track invoices or send reminders. Online subscription billing/payment provider integration will be added later.",
  },
  {
    question: "Can I change plans later?",
    answer:
      "Yes. You can move between Starter and Pro as your client and invoice volume grows.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "Yes. Start with a 14-day free trial. No credit card required, and you can be set up in minutes.",
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
