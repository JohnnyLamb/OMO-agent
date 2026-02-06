import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  webpack: (config) => {
    // Resolve @agent/* to _shared directory (copied from parent src)
    config.resolve.alias = {
      ...config.resolve.alias,
      "@agent": path.resolve(__dirname, "src/_shared"),
    };
    // Handle .js extension imports resolving to .ts files (ESM-style imports)
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js", ".jsx"],
    };
    return config;
  },
  // Turbopack config for dev mode
  turbopack: {
    resolveAlias: {
      "@agent": path.resolve(__dirname, "src/_shared"),
    },
    resolveExtensions: [".ts", ".tsx", ".js", ".jsx", ".json"],
  },
};

export default nextConfig;
