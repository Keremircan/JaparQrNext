import type { NextConfig } from "next";
import packageInfo from "./package.json";

const nextConfig: NextConfig = {
  /* config options here */
  env: {
    // Profil sayfasındaki sürüm satırı için
    NEXT_PUBLIC_APP_VERSION: packageInfo.version,
  },
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
