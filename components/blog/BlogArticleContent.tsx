import type { BlogPost } from "@/lib/blog/types";
import { splitSectionsForInlineImage, slugifyHeading } from "@/lib/blog/format";
import { BlogInlineImage } from "@/components/blog/BlogImage";

const sectionClassName = {
  paragraph: "text-[1.05rem] leading-8 text-slate-600",
  heading2: "scroll-mt-28 text-2xl font-semibold tracking-tight text-slate-900",
  heading3: "scroll-mt-28 text-xl font-semibold tracking-tight text-slate-900",
  list: "my-4 ml-5 list-disc space-y-2 text-[1.05rem] leading-8 text-slate-600",
  callout:
    "my-8 rounded-2xl border border-blue-100 bg-blue-50/70 px-5 py-4 sm:px-6 sm:py-5",
} as const;

type BlogArticleContentProps = {
  post: BlogPost;
};

function renderSections(sections: BlogPost["sections"]) {
  return sections.map((section, index) => {
    if (section.type === "heading") {
      const id = slugifyHeading(section.text);

      if (section.level === 3) {
        return (
          <h3 key={index} id={id} className={`mt-8 ${sectionClassName.heading3}`}>
            {section.text}
          </h3>
        );
      }

      return (
        <h2 key={index} id={id} className={`mt-12 first:mt-0 ${sectionClassName.heading2}`}>
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

    if (section.type === "callout") {
      return (
        <aside key={index} className={sectionClassName.callout}>
          <p className="text-sm font-semibold text-slate-900">{section.title}</p>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">{section.text}</p>
        </aside>
      );
    }

    return (
      <p key={index} className={sectionClassName.paragraph}>
        {section.text}
      </p>
    );
  });
}

export function BlogArticleContent({ post }: BlogArticleContentProps) {
  const { intro, remainder } = splitSectionsForInlineImage(post.sections);
  const showInlineImage = Boolean(post.inArticleImage && post.inArticleImageAlt);

  return (
    <div className="mt-10 space-y-5">
      {renderSections(intro)}

      {showInlineImage ? (
        <BlogInlineImage src={post.inArticleImage!} alt={post.inArticleImageAlt!} />
      ) : null}

      {renderSections(remainder)}
    </div>
  );
}

export function BlogTableOfContents({ post }: BlogArticleContentProps) {
  const headings = post.sections.filter(
    (section): section is Extract<BlogPost["sections"][number], { type: "heading" }> =>
      section.type === "heading" && section.level === 2,
  );

  if (headings.length < 3) return null;

  return (
    <aside className="hidden xl:block">
      <div className="sticky top-28 rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
          On this page
        </p>
        <ul className="mt-4 space-y-2">
          {headings.map((heading) => (
            <li key={heading.text}>
              <a
                href={`#${slugifyHeading(heading.text)}`}
                className="text-sm text-slate-600 transition-colors hover:text-blue-700"
              >
                {heading.text}
              </a>
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
