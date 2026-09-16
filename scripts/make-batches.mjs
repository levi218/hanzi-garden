// Splits the master char list into batch files for content-generation agents.
import { writeFileSync, mkdirSync } from "node:fs";
import levels from "./charlist.mjs";

const BATCH_SIZE = 36;
mkdirSync(new URL("../data/batchlists", import.meta.url), { recursive: true });

const all = [];
for (const lvl of [1, 2, 3]) {
  for (const ch of levels[lvl]) all.push({ char: ch, hsk: lvl });
}

let n = 0;
for (let i = 0; i < all.length; i += BATCH_SIZE) {
  n++;
  const batch = all.slice(i, i + BATCH_SIZE);
  const file = new URL(
    `../data/batchlists/batch-${String(n).padStart(2, "0")}.json`,
    import.meta.url
  );
  writeFileSync(file, JSON.stringify(batch, null, 2));
}
console.log(`${n} batches written, ${all.length} chars total`);
