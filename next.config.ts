import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  productionBrowserSourceMaps: false,
  serverExternalPackages: ["@react-pdf/renderer"],
  env: {
    NEXT_PUBLIC_ADMIN_PATH: process.env.ADMIN_PATH ?? "/admin",
  },
  turbopack: {
    root: __dirname,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "5mb", // allow bigger uploads for logos/avatars
    },
  },
};

export default nextConfig;
