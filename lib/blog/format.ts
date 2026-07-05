import type { BlogPost } from "@/lib/blog/types";

export function formatPublishedDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date(isoDate));
}

export function formatReadTime(minutes: number): string {
  return `${minutes} min read`;
}

export function getCategoryLabel(post: BlogPost): string {
  return post.categoryLabel ?? post.category;
}

export function getAuthorRole(post: BlogPost): string {
  return post.authorRole ?? "Founder of Arrexia";
}

export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

export function extractHeadingAnchors(
  sections: BlogPost["sections"],
): { id: string; text: string; level: 2 | 3 }[] {
  return sections
    .filter(
      (section): section is Extract<BlogPost["sections"][number], { type: "heading" }> =>
        section.type === "heading" && section.level === 2,
    )
    .map((section) => ({
      id: slugifyHeading(section.text),
      text: section.text,
      level: section.level,
    }));
}

export function splitSectionsForInlineImage(sections: BlogPost["sections"]) {
  const firstH2Index = sections.findIndex(
    (section) => section.type === "heading" && section.level === 2,
  );

  if (firstH2Index === -1) {
    return { intro: sections, remainder: [] as BlogPost["sections"] };
  }

  const secondH2Index = sections.findIndex(
    (section, index) =>
      index > firstH2Index && section.type === "heading" && section.level === 2,
  );

  const splitAt = secondH2Index === -1 ? sections.length : secondH2Index;

  return {
    intro: sections.slice(0, splitAt),
    remainder: sections.slice(splitAt),
  };
}
