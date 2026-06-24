// app/layout.tsx
import "./globals.css";
import type { Metadata } from "next";
import { Toaster } from "@/components/ui/toaster";
import { SupabaseAuthStabilizer } from "@/components/auth/SupabaseAuthStabilizer";

export const metadata: Metadata = {
  title: "FlowCollect",
  description: "Cash Flow Solved",
  icons: {
    icon: "/favicon.png",
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
