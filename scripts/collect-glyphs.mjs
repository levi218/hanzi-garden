/**
 * Every CJK codepoint the app can put on screen.
 *
 * Deliberately a blunt scan of all source and data rather than a walk of the
 * dataset's fields: hanzi are scattered through UI copy (游戏, 记得, 迷, 空),
 * game labels, alchemy recipes and the confusables list, and a scan cannot
 * forget one the way a hand-written field list can. Over-collecting costs a
 * few kilobytes; under-collecting shows a visitor an empty box.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Directories holding anything that can reach the page. */
const ROOTS = ["app", "components", "lib", "data"];
const EXTENSIONS = new Set([".ts", ".tsx", ".json", ".css", ".md"]);

/**
 * Ranges worth embedding. Unified Ideographs and Extension A cover the hanzi;
 * the punctuation and fullwidth blocks catch 、。「」 and friends, which fall
 * back to a Latin font with visibly wrong spacing if left out.
 */
const RANGES = [
  [0x2e80, 0x2eff], // CJK radicals supplement
  [0x3000, 0x303f], // CJK symbols and punctuation
  [0x31c0, 0x31ef], // CJK strokes
  [0x3400, 0x4dbf], // Unified Ideographs Extension A
  [0x4e00, 0x9fff], // Unified Ideographs
  [0xf900, 0xfaff], // Compatibility Ideographs
  [0xfe30, 0xfe4f], // CJK compatibility forms
  [0xff00, 0xffef], // Halfwidth and fullwidth forms
];

const inRange = (cp) => RANGES.some(([lo, hi]) => cp >= lo && cp <= hi);

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      // public/strokes is path geometry keyed by codepoint, not text.
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      yield* walk(path);
    } else if (EXTENSIONS.has(extname(entry.name))) {
      yield path;
    }
  }
}

export async function collectGlyphs() {
  const found = new Set();
  for (const dir of ROOTS) {
    for await (const file of walk(join(root, dir))) {
      for (const ch of await readFile(file, "utf8")) {
        const cp = ch.codePointAt(0);
        if (inRange(cp)) found.add(ch);
      }
    }
  }
  // Sorted so the generated font and its manifest are byte-stable across runs,
  // which keeps a regeneration out of the diff unless the glyphs really moved.
  return [...found].sort((a, b) => a.codePointAt(0) - b.codePointAt(0));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const glyphs = await collectGlyphs();
  console.log(`${glyphs.length} CJK codepoints`);
  console.log(glyphs.join(""));
}
