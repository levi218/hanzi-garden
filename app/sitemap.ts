import type { MetadataRoute } from "next";

import { characters, slugFor } from "@/lib/characters";
import { GAME_LIST } from "@/lib/games";
import { canonical } from "@/lib/site";

/**
 * `output: export` has no server to run this at request time, so it must be
 * pinned as static and emitted as a file at build.
 */
export const dynamic = "force-static";

/**
 * Every page in the export, character pages included — they are the long tail
 * worth indexing, one per hanzi with its own pinyin, gloss and stroke count.
 *
 * `lastModified` is deliberately absent. This is a static export, so a date
 * here would only ever mean "when the site was last built", which is a lie
 * that teaches crawlers to ignore the field.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: canonical("/"), changeFrequency: "monthly", priority: 1 },
    { url: canonical("/games"), changeFrequency: "monthly", priority: 0.8 },
    ...GAME_LIST.map((game) => ({
      url: canonical(game.href),
      changeFrequency: "monthly" as const,
      priority: 0.7,
    })),
    // Progress is a private, device-local dashboard: it renders empty for a
    // crawler, so it is listed low rather than left to compete with real pages.
    { url: canonical("/progress"), changeFrequency: "yearly", priority: 0.3 },
    ...characters.map((entry) => ({
      url: canonical(`/character/${slugFor(entry.char)}`),
      changeFrequency: "yearly" as const,
      priority: 0.6,
    })),
  ];
}
