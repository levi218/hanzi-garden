// Merges data/batches/batch-*.json into data/characters.json after validation.
import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import levels from "./charlist.mjs";

const root = path.dirname(fileURLToPath(import.meta.url));
const batchesDir = path.join(root, "../data/batches");

const expected = new Map(); // char -> hsk
for (const lvl of [1, 2, 3]) for (const ch of levels[lvl]) expected.set(ch, lvl);

const problems = [];
const entries = new Map();

let files = [];
try {
  files = readdirSync(batchesDir).filter((f) => f.endsWith(".json")).sort();
} catch {
  console.error("no data/batches directory yet");
  process.exit(1);
}

for (const f of files) {
  let arr;
  try {
    arr = JSON.parse(readFileSync(path.join(batchesDir, f), "utf8"));
  } catch (e) {
    problems.push(`${f}: invalid JSON (${e.message})`);
    continue;
  }
  if (!Array.isArray(arr)) {
    problems.push(`${f}: not an array`);
    continue;
  }
  for (const e of arr) {
    const where = `${f} char=${e?.char}`;
    if (!e || typeof e.char !== "string" || e.char.length !== 1) {
      problems.push(`${where}: bad char`);
      continue;
    }
    if (!expected.has(e.char)) problems.push(`${where}: not in master list`);
    if (entries.has(e.char)) problems.push(`${where}: duplicate entry`);
    if (typeof e.pinyin !== "string" || !e.pinyin) problems.push(`${where}: missing pinyin`);
    if (![1, 2, 3].includes(e.hsk)) problems.push(`${where}: bad hsk`);
    if (typeof e.strokes !== "number" || e.strokes < 1) problems.push(`${where}: bad strokes`);
    if (typeof e.radical !== "string" || !e.radical) problems.push(`${where}: missing radical`);
    if (!Array.isArray(e.meanings) || e.meanings.length < 1 || e.meanings.some((m) => !m?.pos || !m?.def))
      problems.push(`${where}: bad meanings`);
    if (!Array.isArray(e.components) || e.components.length < 1 || e.components.some((c) => !c?.part || !c?.pinyin || !c?.meaning))
      problems.push(`${where}: bad components`);
    if (typeof e.compositionNote !== "string" || !e.compositionNote)
      problems.push(`${where}: missing compositionNote`);
    if (!Array.isArray(e.words) || e.words.length < 1 || e.words.some((w) => !w?.word || !w?.pinyin || !w?.meaning))
      problems.push(`${where}: bad words`);
    if (!Array.isArray(e.poem) || e.poem.length < 3 || e.poem.length > 6 || e.poem.some((l) => typeof l !== "string" || !l))
      problems.push(`${where}: bad poem`);
    entries.set(e.char, e);
  }
}

const missing = [...expected.keys()].filter((ch) => !entries.has(ch));
if (missing.length) problems.push(`MISSING ${missing.length} chars: ${missing.join("")}`);

console.log(`entries: ${entries.size}/${expected.size}, problems: ${problems.length}`);
for (const p of problems) console.log("  -", p);

if (process.argv.includes("--write")) {
  // sort by hsk then by master-list order
  const order = [...expected.keys()];
  const sorted = [...entries.values()].sort(
    (a, b) => a.hsk - b.hsk || order.indexOf(a.char) - order.indexOf(b.char)
  );
  const out = path.join(root, "../data/characters.json");
  writeFileSync(out, JSON.stringify(sorted, null, 2));
  console.log(`wrote ${sorted.length} entries to data/characters.json`);
}
