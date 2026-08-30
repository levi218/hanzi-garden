/**
 * Builds the self-hosted hanzi fallback font.
 *
 * The site's `--font-hanzi` stack asks for the CJK fonts that ship with macOS,
 * Windows, iOS and Android, which covers nearly every visitor at zero cost.
 * Nearly. A Linux desktop with no CJK font installed renders every character
 * on this site as an empty box — on a site that is *about* the characters.
 *
 * So this generates a subset of Noto Sans SC holding only the ~1100 codepoints
 * the app can actually display. The @font-face for it is *not* in the
 * stylesheet: Chromium downloads a webfont whenever it appears in a matched
 * font-family list, even when an earlier local font already covered every
 * character, which would have cost every visitor ~280 kB for nothing. Instead
 * components/HanziFontProbe.tsx checks whether the browser can draw a hanzi at
 * all and injects the @font-face only when it cannot.
 *
 *   node scripts/build-hanzi-font.mjs
 *
 * Outputs are committed; the 17 MB variable source is cached, not committed.
 * Noto Sans SC is under the SIL Open Font License 1.1 (public/fonts/OFL.txt).
 */
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import subsetFont from "subset-font";

import { collectGlyphs } from "./collect-glyphs.mjs";
import { coveredCodepoints } from "./lib-cmap.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "public", "fonts");
const cacheDir = join(root, "node_modules", ".cache", "hanzi-font");

const UPSTREAM = "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanssc";
const SOURCE = "NotoSansSC[wght].ttf";

/**
 * Only the weights the app actually asks for alongside `.font-hanzi`: normal
 * body text, and the semibold used by the two page headings. `font-medium`
 * (500) resolves down to 400 by the CSS weight-matching rules, which for a
 * fallback nobody with a system font will ever see is a fair trade against
 * another 300 kB.
 */
const WEIGHTS = [400, 600];

async function cached(name, fetchUrl) {
  const path = join(cacheDir, name);
  try {
    await stat(path);
    console.log(`  cached  ${name}`);
    return readFile(path);
  } catch {
    process.stdout.write(`  fetch   ${name} ... `);
    const response = await fetch(fetchUrl);
    if (!response.ok) throw new Error(`${response.status} fetching ${fetchUrl}`);
    const body = Buffer.from(await response.arrayBuffer());
    await mkdir(cacheDir, { recursive: true });
    await writeFile(path, body);
    console.log(`${(body.length / 1_048_576).toFixed(1)} MB`);
    return body;
  }
}

const glyphs = await collectGlyphs();
console.log(`Subsetting Noto Sans SC to ${glyphs.length} codepoints`);

const source = await cached(SOURCE, `${UPSTREAM}/${encodeURIComponent(SOURCE)}`);
const license = await cached("OFL.txt", `${UPSTREAM}/OFL.txt`);
await mkdir(outDir, { recursive: true });
await writeFile(join(outDir, "OFL.txt"), license);

const text = glyphs.join("");
const wanted = glyphs.map((ch) => ch.codePointAt(0));

for (const weight of WEIGHTS) {
  // `variationAxes` pins the variable axis, so each output is a static
  // instance rather than a variable font carrying all nine weights.
  const options = { variationAxes: { wght: weight } };
  const woff2 = await subsetFont(source, text, { ...options, targetFormat: "woff2" });
  const file = `noto-sans-sc-subset-${weight}.woff2`;
  await writeFile(join(outDir, file), woff2);

  // woff2 is compressed past the reach of a plain table reader, so coverage is
  // checked on the same subset emitted as TrueType. Verifying rather than
  // trusting: a dropped glyph is invisible until someone without a system CJK
  // font loads the page, which is exactly the person this font is for.
  const ttf = await subsetFont(source, text, { ...options, targetFormat: "truetype" });
  const covered = coveredCodepoints(ttf);
  const missing = wanted.filter((cp) => !covered.has(cp));

  console.log(
    `  write   ${file}  ${(woff2.length / 1024).toFixed(1)} kB  ` +
      `${wanted.length - missing.length}/${wanted.length} glyphs`,
  );
  if (missing.length > 0) {
    const shown = missing.map((cp) => String.fromCodePoint(cp)).join("");
    console.warn(`  WARN    ${missing.length} not in Noto Sans SC: ${shown}`);
  }
}
