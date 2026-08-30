import type { MetadataRoute } from "next";

import { basePath, local, site } from "@/lib/site";

/**
 * `output: export` has no server to run this at request time, so it must be
 * pinned as static and emitted as a file at build.
 */
export const dynamic = "force-static";

/**
 * Installable-app metadata. `start_url` and `scope` carry the sub-path because
 * a manifest's URLs resolve against the manifest's own location, and an
 * out-of-scope `start_url` makes the install prompt disappear silently.
 */
export default function manifest(): MetadataRoute.Manifest {
  const root = `${basePath}/`;
  return {
    name: `${site.fullName} — learn Chinese characters`,
    short_name: site.latinName,
    description: site.description,
    start_url: root,
    scope: root,
    display: "standalone",
    orientation: "any",
    background_color: "#fbf6ee",
    theme_color: "#fbf6ee",
    categories: ["education", "games"],
    lang: "en",
    icons: [
      { src: local("icon.svg"), sizes: "any", type: "image/svg+xml" },
      { src: local("icon-192.png"), sizes: "192x192", type: "image/png" },
      { src: local("icon-512.png"), sizes: "512x512", type: "image/png" },
      {
        // Android crops up to 20% off each edge; this one is drawn with that
        // safe area already built in.
        src: local("icon-maskable-512.png"),
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
