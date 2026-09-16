# 汉字 Garden

A static Next.js app for learning the **565 most-used Chinese characters** (HSK 1–3). Every character has a dictionary-style entry — pinyin, stroke count, radical, meanings, real component decomposition, common example words and a four-line mnemonic poem — and four games that turn reading them into remembering them.

## Sections

**Browse** — all 565 characters with level tabs and search by hanzi, pinyin (tone-insensitive: `hao` matches `hǎo`) or English meaning. Press `/` to focus the search box.

**Character pages** — building-block breakdown (`女 + 子 = 好`), composition note, mnemonic poem, example words, prev/next within the level, and this character's current memory state.

**Games** — four angles on the same problem:

| Game | 汉字 | What it trains |
|---|---|---|
| Character Alchemy | 合成 | Combine components into characters. Wrong-but-real combinations still count as discoveries, which is how you learn that characters are a small set of parts recombined. |
| Spot the Imposter | 辨识 | Rapid rounds on near-identical characters (喝/渴, 请/清/情/晴, 块/快, 找/我) against a shrinking clock. Classic traps whose partners sit outside HSK 1–3, like 未/末 and 田/由/甲, appear as distractors so the reveal still teaches them. |
| Stroke Rhythm | 笔顺 | Trace strokes in order, on the beat. Correct order is scored, not just correct shape. |
| Territory Map | 疆域 | Each character is a hex tile you conquer by answering correctly. Tiles decay if you neglect them — a review queue shaped like a campaign. |

**Progress** — streak, activity heatmap, accuracy, per-level mastery rings and per-game bests.

## How progress works

All four games write to one store (`lib/progress.ts`, localStorage, no account and no server). A character's strength is `tier × retention`, where the tier is how many times in a row you have got it right (0–5) and retention decays on a half-life that grows with the tier — 0.35, 1, 2.5, 6, 15, then 40 days. That single model decides the colour of a territory hex, which characters a game serves up next, and what the dashboard calls "held", "fading" or "mastered". Practice anywhere counts everywhere.

## Development

```bash
npm install
npm run dev        # dev server
npm run build      # static export to out/
npm run lint       # eslint
npm run typecheck  # tsc --noEmit
npm run brand      # regenerate icons + social card
npm run font       # regenerate the hanzi fallback font subset
```

Serve the static build locally:

```bash
npx serve out
```

## Deployment

The site is a static export with no server behind it, published to **GitHub
Pages** by `.github/workflows/deploy.yml` on every push to `main`.

Nothing about the URL is hardcoded. `actions/configure-pages` reports where
this repository is published and the workflow passes that to the build as two
public environment variables, which `lib/site.ts` and `next.config.ts` read:

| Variable | What it sets | Example |
|---|---|---|
| `NEXT_PUBLIC_SITE_URL` | Canonical base, sub-path included. Drives canonical links, the sitemap, Open Graph tags and the manifest. | `https://you.github.io/chinese` |
| `NEXT_PUBLIC_BASE_PATH` | Sub-path the site is served under; empty at a domain root. | `/chinese` |
| `NEXT_PUBLIC_GA_ID` | Google Analytics 4 measurement ID. Unset ships no analytics and no cookie banner. | `G-XXXXXXXXXX` |

Rename the repository, or attach a custom domain in the Pages settings, and
every URL follows without a code change. See `.env.example` to build like
production locally.

**One-time setup:** in the repository settings, set Pages -> Build and
deployment -> Source to *GitHub Actions*, and add `NEXT_PUBLIC_GA_ID` under
Secrets and variables -> Actions -> **Variables** (not Secrets — it is a public
value baked into the bundle).

`public/.nojekyll` is what stops Pages running the export through Jekyll, which
would otherwise drop the `_next` directory and serve a site with no JavaScript.

## SEO

Every page carries a canonical URL, Open Graph and Twitter card tags, and a
title and description written for it. `app/sitemap.ts` lists all 572 URLs —
the 565 character pages included, since those are the long tail worth
indexing — and character pages ship `DefinedTerm` and `BreadcrumbList`
structured data so a result can read "汉字 Garden › HSK 2 › 好".

One caveat specific to a GitHub Pages **project** site: crawlers only read
`robots.txt` at the domain root, which belongs to the account rather than this
repository, so the generated `/chinese/robots.txt` will not be found. Submit
`https://you.github.io/chinese/sitemap.xml` to Google Search Console directly.
Moving to a custom domain makes the generated file authoritative and the
problem goes away.

## Analytics

Google Analytics 4, loaded through `next/script` and gated twice over: nothing
loads unless `NEXT_PUBLIC_GA_ID` is set, and nothing is measured until the
visitor accepts. Consent Mode v2 defaults are inlined into the prerendered HTML
(`components/analytics/ConsentBootstrap.tsx`) with every signal denied, so the
tag is already constrained when it loads rather than a moment afterwards. Ad
storage and personalisation are denied permanently, not just by default.

The choice lives in localStorage, not a cookie, and the footer carries a
control to change it. Study progress is untouched by any of this — it never
leaves the browser.

## Fonts

`--font-hanzi` in `app/globals.css` asks for the CJK fonts that ship with
macOS, Windows, iOS and Android, which covers very nearly everyone. Very
nearly: a Linux desktop or a stripped container with no CJK font installed
renders every character on this site as an empty box — on a site that is
*about* the characters.

`npm run font` closes that gap. It subsets Noto Sans SC down to the ~1100
codepoints the app can actually display (`scripts/collect-glyphs.mjs` scans all
source and data for them, so UI copy and radicals outside the 565 are included)
and writes two weights, ~140 kB each, to `public/fonts`. The script parses the
subset's own `cmap` afterwards and reports any codepoint that did not make it,
so a silently dropped glyph fails loudly at build rather than on a stranger's
screen.

The `@font-face` rule deliberately **is not in the stylesheet**. Chromium
downloads a webfont whenever it appears in a matched `font-family` list, even
when an earlier local font already drew every character — that would have
billed ~280 kB to every visitor to help none of them. Instead
`components/HanziFontProbe.tsx` draws a hanzi to a canvas, compares it against
a private-use codepoint that no font defines, and injects the rule only when
the two come out identical. Anyone with a system CJK font fetches nothing.

Noto Sans SC is used under the SIL Open Font License 1.1
(`public/fonts/OFL.txt`). The 17 MB variable source is downloaded on demand and
cached under `node_modules/.cache`, not committed; the subsets are.

## Brand assets

`public/og.png`, the favicons and the PWA icons are generated by
`npm run brand` and committed. The 汉字 in the social card is drawn from the
Make Me a Hanzi stroke outlines in `public/strokes`, not set in a font, which
is why the card needs no embedded CJK font to render it.

## Data

- `data/characters.json` — the full dataset (schema in `lib/types.ts`)
- `data/stroke-counts.json` and `public/strokes/*.json` — stroke-order paths and medians, generated by `node scripts/build-stroke-data.mjs` from the [hanzi-writer-data](https://github.com/chanind/hanzi-writer-data) package (derived from Make Me a Hanzi, Arphic Public License). Re-run the script if the character list changes.
