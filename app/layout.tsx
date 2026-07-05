// app/layout.tsx
import "./globals.css";
import type { Metadata, Viewport } from "next";
import { JsonLd } from "@/components/seo/JsonLd";
import { Toaster } from "@/components/ui/toaster";
import { SupabaseAuthStabilizer } from "@/components/auth/SupabaseAuthStabilizer";
import { buildRootMetadata, buildRootViewport } from "@/lib/seo/metadata";
import { buildOrganizationSchema, buildWebsiteSchema } from "@/lib/seo/structured-data";

export const metadata: Metadata = buildRootMetadata();
export const viewport: Viewport = buildRootViewport();

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <JsonLd data={[buildOrganizationSchema(), buildWebsiteSchema()]} />
        <SupabaseAuthStabilizer />
        {children}
        <Toaster />
      </body>
    </html>
  );
}
