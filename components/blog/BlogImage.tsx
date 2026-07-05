import Image from "next/image";
import { BLOG_COVER_HEIGHT, BLOG_COVER_WIDTH } from "@/lib/blog/assets";

type BlogCoverImageProps = {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
  sizes?: string;
};

export function BlogCoverImage({
  src,
  alt,
  priority = false,
  className = "",
  sizes = "(max-width: 768px) 100vw, (max-width: 1200px) 80vw, 960px",
}: BlogCoverImageProps) {
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-slate-100 ${className}`.trim()}>
      <Image
        src={src}
        alt={alt}
        width={BLOG_COVER_WIDTH}
        height={BLOG_COVER_HEIGHT}
        priority={priority}
        sizes={sizes}
        className="h-full w-full object-cover"
      />
    </div>
  );
}

type BlogInlineImageProps = {
  src: string;
  alt: string;
  className?: string;
};

export function BlogInlineImage({ src, alt, className = "" }: BlogInlineImageProps) {
  return (
    <figure className={`my-10 overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 ${className}`.trim()}>
      <Image
        src={src}
        alt={alt}
        width={1200}
        height={675}
        sizes="(max-width: 768px) 100vw, 720px"
        className="h-auto w-full object-cover"
      />
    </figure>
  );
}

type BlogThumbnailImageProps = {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
};

export function BlogThumbnailImage({
  src,
  alt,
  priority = false,
  className = "aspect-[16/10]",
}: BlogThumbnailImageProps) {
  return (
    <div className={`relative overflow-hidden bg-slate-100 ${className}`.trim()}>
      <Image
        src={src}
        alt={alt}
        width={640}
        height={400}
        priority={priority}
        sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 400px"
        className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
      />
    </div>
  );
}
