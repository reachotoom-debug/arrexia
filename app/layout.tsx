// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import { Toaster } from "@/components/ui/toaster";
import { SupabaseAuthStabilizer } from "@/components/auth/SupabaseAuthStabilizer";
import { ARREXIA_BRAND } from "@/lib/brand/assets";
import { getConfiguredAppUrl } from "@/lib/config/appUrl";

export const metadata: Metadata = {
  metadataBase: new URL(getConfiguredAppUrl()),
  title: "Arrexia",
  description: "Cash Flow Solved",
  icons: {
    icon: [
      { url: ARREXIA_BRAND.favicon, sizes: "any" },
      { url: ARREXIA_BRAND.icon, type: "image/png", sizes: "512x512" },
    ],
    shortcut: ARREXIA_BRAND.favicon,
    apple: ARREXIA_BRAND.appleTouchIcon,
  },
  openGraph: {
    title: "Arrexia",
    description: "Cash Flow Solved",
    siteName: "Arrexia",
    images: [
      {
        url: ARREXIA_BRAND.ogImage,
        width: 1200,
        height: 630,
        alt: "Arrexia",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Arrexia",
    description: "Cash Flow Solved",
    images: [ARREXIA_BRAND.ogImage],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <SupabaseAuthStabilizer />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
