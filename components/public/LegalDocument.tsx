import type { ReactNode } from "react";

export type LegalSection = {
  id: string;
  title: string;
  content: ReactNode;
};

type LegalDocumentProps = {
  title: string;
  intro: ReactNode;
  sections: LegalSection[];
  disclaimer?: string;
  lastUpdated?: string;
};

const sectionContentClassName =
  "space-y-4 text-base leading-relaxed text-slate-600 [&_a]:font-medium [&_a]:text-blue-600 [&_a]:no-underline hover:[&_a]:text-blue-700 [&_h3]:mt-6 [&_h3]:text-base [&_h3]:font-semibold [&_h3]:text-slate-900 [&_li]:ml-5 [&_li]:list-disc [&_strong]:font-semibold [&_strong]:text-slate-900 [&_ul]:space-y-2";

export function LegalDocument({ title, intro, sections, disclaimer, lastUpdated }: LegalDocumentProps) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-16 sm:px-6 sm:py-20">
      <header className="border-b border-slate-200 pb-8">
        <h1 className="text-3xl font-semibold tracking-tight text-slate-900 sm:text-4xl">{title}</h1>
        {lastUpdated ? (
          <p className="mt-3 text-sm text-slate-500">Last updated: {lastUpdated}</p>
        ) : null}
        <div className="mt-6 text-base leading-relaxed text-slate-600 [&_a]:font-medium [&_a]:text-blue-600 [&_a]:no-underline hover:[&_a]:text-blue-700">
          {intro}
        </div>
      </header>

      <div className="mt-10 space-y-10">
        {sections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-24">
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">{section.title}</h2>
            <div className={`mt-4 ${sectionContentClassName}`}>{section.content}</div>
          </section>
        ))}
      </div>

      {disclaimer ? (
        <p className="mt-12 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-900">
          {disclaimer}
        </p>
      ) : null}
    </article>
  );
}
