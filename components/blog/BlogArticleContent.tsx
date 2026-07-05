import type { BlogPostSection } from "@/lib/blog/types";

const sectionClassName = {
  paragraph: "text-base leading-relaxed text-slate-600",
  heading2: "mt-10 text-2xl font-semibold tracking-tight text-slate-900",
  heading3: "mt-8 text-xl font-semibold tracking-tight text-slate-900",
  list: "ml-5 list-disc space-y-2 text-base leading-relaxed text-slate-600",
} as const;

type BlogArticleContentProps = {
  sections: BlogPostSection[];
};

export function BlogArticleContent({ sections }: BlogArticleContentProps) {
  return (
    <div className="mt-8 space-y-4">
      {sections.map((section, index) => {
        if (section.type === "heading") {
          if (section.level === 3) {
            return (
              <h3 key={index} className={sectionClassName.heading3}>
                {section.text}
              </h3>
            );
          }

          return (
            <h2 key={index} className={sectionClassName.heading2}>
              {section.text}
            </h2>
          );
        }

        if (section.type === "list") {
          return (
            <ul key={index} className={sectionClassName.list}>
              {section.items.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          );
        }

        return (
          <p key={index} className={sectionClassName.paragraph}>
            {section.text}
          </p>
        );
      })}
    </div>
  );
}
