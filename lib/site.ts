/**
 * Single source of truth for everything the site says about itself:
 * names, copy, canonical URLs and the social card.
 *
 * The two environment variables below are the only things that change between
 * a local build and the deployed one, and the GitHub Pages workflow fills them
 * in from `actions/configure-pages` rather than anything being hardcoded —
 * see `.github/workflows/deploy.yml` and `.env.example`.
 */

/** Origin *plus* any sub-path, e.g. `https://you.github.io/chinese`. */
const ORIGIN = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(
  /\/+$/,
  "",
);

/**
 * The sub-path the site is served under, `""` at a domain root. Next rewrites
 * `<Link>` hrefs and bundled assets itself; this exists for the handful of
 * places that build a URL by hand (`fetch`, the web manifest, JSON-LD).
 */
export const basePath = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/+$/, "");

/**
 * Absolute, canonical URL for a route.
 *
 * `trailingSlash: true` in next.config.ts means `/games` and `/games/` are two
 * spellings of one page, and only the slashed one is a real file in the export.
 * Canonicals have to name that spelling or search engines get to pick, so the
 * slash is added here rather than at every call site.
 */
export function canonical(path = "/"): string {
  const clean = `/${path}`.replace(/\/{2,}/g, "/");
  const slashed = clean.endsWith("/") ? clean : `${clean}/`;
  return `${ORIGIN}${slashed === "/" ? "/" : slashed}`;
}

/**
 * Scheme and host only — no sub-path.
 *
 * This is what `metadataBase` wants: Next resolves relative metadata URLs
 * against it *after* applying `basePath` itself, so handing it the sub-path
 * version would double the sub-path in every social tag.
 */
export const origin = new URL(ORIGIN).origin;

/**
 * Absolute URL for a file in `public/`.
 *
 * For things a *remote* machine has to fetch — Open Graph images, JSON-LD —
 * where a relative path is meaningless. Prefer `local()` for anything the
 * visitor's own browser resolves.
 */
export function asset(path: string): string {
  return `${ORIGIN}/${path.replace(/^\/+/, "")}`;
}

/**
 * Same-origin path for a file in `public/`, sub-path included.
 *
 * Favicons and manifest icons use this rather than `asset()` so they keep
 * working on whatever host actually served the page — the *.github.io URL, a
 * custom domain, a local preview — instead of being pinned to whichever one
 * `NEXT_PUBLIC_SITE_URL` named at build time.
 */
export function local(path: string): string {
  return `${basePath}/${path.replace(/^\/+/, "")}`;
}

export const site = {
  hanziName: "汉字",
  latinName: "Garden",
  fullName: "汉字 Garden",
  url: ORIGIN,
  locale: "en_US",
  tagline:
    "A small garden of Chinese characters — each with its roots, its story, and its own four-line poem.",
  description:
    "Learn the most-used Chinese characters of HSK 1-3. Every character comes with pinyin, meanings, stroke count, radical, its building blocks, example words and a playful mnemonic poem.",
  /**
   * Shown by every social card that has no more specific image of its own.
   * Regenerate with `node scripts/build-brand-assets.mjs`.
   */
  ogImage: {
    url: asset("og.png"),
    width: 1200,
    height: 630,
    alt: "汉字 Garden — learn the 565 most-used Chinese characters, HSK 1 to 3",
  },
} as const;

/**
 * The per-page half of the metadata: canonical URL plus matching Open Graph
 * and Twitter cards.
 *
 * Next merges page metadata over the root layout's, but it does *not* merge
 * inside `openGraph` — a page that sets only `openGraph.title` would lose the
 * site name, locale and image. So each page spreads this instead, and the only
 * thing it has to decide is its path, title and description.
 */
export function pageMetadata({
  path,
  title,
  description,
  image,
}: {
  path: string;
  title: string;
  description: string;
  /** Overrides the shared social card. Must be an absolute URL. */
  image?: { url: string; width: number; height: number; alt: string };
}) {
  const card = image ?? site.ogImage;
  return {
    alternates: { canonical: canonical(path) },
    openGraph: {
      type: "website" as const,
      siteName: site.fullName,
      locale: site.locale,
      url: canonical(path),
      title,
      description,
      images: [card],
    },
    twitter: {
      card: "summary_large_image" as const,
      title,
      description,
      images: [card.url],
    },
  };
}
