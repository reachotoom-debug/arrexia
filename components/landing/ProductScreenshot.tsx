import Image from "next/image";

type ProductScreenshotProps = {
  src: string;
  alt: string;
  width: number;
  height: number;
  priority?: boolean;
  sizes?: string;
  className?: string;
};

export function ProductScreenshot({
  src,
  alt,
  width,
  height,
  priority = false,
  sizes = "(max-width: 1024px) 100vw, (max-width: 1280px) 90vw, 1152px",
  className = "",
}: ProductScreenshotProps) {
  return (
    <figure className={className}>
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-xl shadow-slate-900/10">
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          priority={priority}
          sizes={sizes}
          className="h-auto w-full object-contain object-left-top"
        />
      </div>
    </figure>
  );
}
