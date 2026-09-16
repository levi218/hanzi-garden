import type { NextConfig } from "next";

/**
 * Sub-path the site is served under. Empty at a domain root; `/<repo>` on a
 * GitHub Pages project site, where the deploy workflow passes the value from
 * `actions/configure-pages` so the repository name is never hardcoded.
 */
const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

const nextConfig: NextConfig = {
  // The dev server only accepts asset requests from localhost by default;
  // the app is also opened via this loopback alias.
  allowedDevOrigins: ["127.0.2.2"],
  output: "export",
  images: { unoptimized: true },
  trailingSlash: true,
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};

export default nextConfig;
