"use client";

import { Linkedin, Link2 } from "lucide-react";
import { SEO_SITE_URL } from "@/lib/seo/site";

type BlogShareLinksProps = {
  title: string;
  slug: string;
};

export function BlogShareLinks({ title, slug }: BlogShareLinksProps) {
  const articleUrl = `${SEO_SITE_URL}/blog/${slug}`;
  const linkedInUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(articleUrl)}`;

  async function handleCopyLink(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    try {
      await navigator.clipboard.writeText(articleUrl);
    } catch {
      window.prompt("Copy this link:", articleUrl);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-slate-500">Share:</span>
      <a
        href={linkedInUrl}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`Share ${title} on LinkedIn`}
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:border-slate-300 hover:text-blue-700"
      >
        <Linkedin className="h-4 w-4" aria-hidden="true" />
      </a>
      <button
        type="button"
        onClick={handleCopyLink}
        aria-label="Copy article link"
        className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-600 transition-colors hover:border-slate-300 hover:text-blue-700"
      >
        <Link2 className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}
