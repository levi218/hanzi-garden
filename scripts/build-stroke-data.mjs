// Extracts stroke-order data for the characters in data/characters.json out of
// the hanzi-writer-data package and writes one file per character into
// public/strokes/. The game fetches these on demand, so the bundle stays small
// and the site keeps working as a pure static export.
//
// Run with: node scripts/build-stroke-data.mjs
import { mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.join(root, "node_modules", "hanzi-writer-data");
const outDir = path.join(root, "public", "strokes");

function slugFor(char) {
  return `u${char.codePointAt(0).toString(16).padStart(4, "0")}`;
}

const characters = JSON.parse(
  await readFile(path.join(root, "data", "characters.json"), "utf8"),
);

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const missing = [];
const manifest = {};

for (const entry of characters) {
  const file = path.join(source, `${entry.char}.json`);
  if (!existsSync(file)) {
    missing.push(entry.char);
    continue;
  }
  const raw = JSON.parse(await readFile(file, "utf8"));
  // Keep only what the rhythm game draws and scores.
  const payload = {
    char: entry.char,
    strokes: raw.strokes,
    medians: raw.medians,
  };
  await writeFile(
    path.join(outDir, `${slugFor(entry.char)}.json`),
    JSON.stringify(payload),
  );
  manifest[entry.char] = raw.strokes.length;
}

await writeFile(
  path.join(root, "data", "stroke-counts.json"),
  `${JSON.stringify(manifest, null, 0)}\n`,
);

console.log(
  `wrote ${Object.keys(manifest).length} stroke files to public/strokes`,
);
if (missing.length) console.log(`missing stroke data: ${missing.join(" ")}`);
