import Image from "next/image";
import type { CSSProperties } from "react";
import { ARREXIA_BRAND } from "@/lib/brand/assets";

const LOGO_SOURCES = {
  light: ARREXIA_BRAND.logoLight,
  dark: ARREXIA_BRAND.logoDark,
  icon: ARREXIA_BRAND.icon,
} as const;

const FULL_LOGO_WIDTH = 1774;
const FULL_LOGO_HEIGHT = 887;

type ArrexiaLogoProps = {
  variant: keyof typeof LOGO_SOURCES;
  /** Target render height in pixels when not sized via CSS classes. */
  height: number;
  className?: string;
  priority?: boolean;
  alt?: string;
};

function hasCssHeightControl(className?: string): boolean {
  if (!className) return false;
  return /\b(h-|max-h-|min-h-)/.test(className);
}

function hasCssWidthControl(className?: string): boolean {
  if (!className) return false;
  return /\b(w-|max-w-|min-w-)/.test(className);
}

function buildLogoStyle(
  variant: keyof typeof LOGO_SOURCES,
  height: number,
  className?: string,
): CSSProperties {
  const isIcon = variant === "icon";
  const cssHeight = hasCssHeightControl(className);
  const cssWidth = hasCssWidthControl(className);

  const style: CSSProperties = { objectFit: "contain" };

  if (cssHeight) {
    style.width = "auto";
    return style;
  }

  if (cssWidth) {
    style.height = "auto";
    return style;
  }

  style.height = height;
  style.width = isIcon ? height : "auto";
  return style;
}

export function ArrexiaLogo({
  variant,
  height,
  className,
  priority,
  alt = "Arrexia accounts receivable software logo",
}: ArrexiaLogoProps) {
  const isIcon = variant === "icon";
  const intrinsicWidth = isIcon ? height : FULL_LOGO_WIDTH;
  const intrinsicHeight = isIcon ? height : FULL_LOGO_HEIGHT;

  return (
    <Image
      src={LOGO_SOURCES[variant]}
      alt={alt}
      width={intrinsicWidth}
      height={intrinsicHeight}
      priority={priority}
      className={["shrink-0 object-contain", className].filter(Boolean).join(" ")}
      style={buildLogoStyle(variant, height, className)}
    />
  );
}
