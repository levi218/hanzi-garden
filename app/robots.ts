import type { MetadataRoute } from "next";

import { asset } from "@/lib/site";

/**
 * `output: export` has no server to run this at request time, so it must be
 * pinned as static and emitted as a file at build.
 */
export const dynamic = "force-static";

/**
 * Note for a GitHub Pages *project* site: crawlers only read the robots.txt at
 * the domain root, which belongs to the account, not this repository. This
 * file is still correct and still worth shipping — it becomes authoritative
 * the moment the site moves to a custom domain — but until then the sitemap
 * should be submitted to Search Console directly. See README.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
    },
    sitemap: asset("sitemap.xml"),
  };
}
