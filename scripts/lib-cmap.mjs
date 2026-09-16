/**
 * Minimal TrueType `cmap` reader — just enough to answer "which codepoints
 * does this font actually draw?".
 *
 * Exists so `build-hanzi-font.mjs` can assert its own output instead of
 * trusting it: a subsetter silently dropping glyphs looks exactly like a
 * successful run until someone loads the site without a system CJK font.
 */

/** Covered codepoints in a TrueType/OpenType buffer, as a Set of numbers. */
export function coveredCodepoints(buf) {
  const numTables = buf.readUInt16BE(4);
  let cmapOffset = -1;
  for (let i = 0; i < numTables; i += 1) {
    const rec = 12 + i * 16;
    if (buf.toString("ascii", rec, rec + 4) === "cmap") {
      cmapOffset = buf.readUInt32BE(rec + 8);
      break;
    }
  }
  if (cmapOffset < 0) throw new Error("no cmap table");

  // Prefer a full Unicode subtable (format 12) over the BMP-only format 4.
  const subtables = [];
  const numSub = buf.readUInt16BE(cmapOffset + 2);
  for (let i = 0; i < numSub; i += 1) {
    const rec = cmapOffset + 4 + i * 8;
    const platform = buf.readUInt16BE(rec);
    const encoding = buf.readUInt16BE(rec + 2);
    const offset = cmapOffset + buf.readUInt32BE(rec + 4);
    const unicode =
      platform === 0 || (platform === 3 && (encoding === 1 || encoding === 10));
    if (unicode) subtables.push({ offset, format: buf.readUInt16BE(offset) });
  }

  const covered = new Set();
  for (const { offset, format } of subtables) {
    if (format === 12) readFormat12(buf, offset, covered);
    else if (format === 4) readFormat4(buf, offset, covered);
  }
  if (covered.size === 0) throw new Error("no readable Unicode cmap subtable");
  return covered;
}

function readFormat12(buf, offset, out) {
  const groups = buf.readUInt32BE(offset + 12);
  for (let i = 0; i < groups; i += 1) {
    const g = offset + 16 + i * 12;
    const start = buf.readUInt32BE(g);
    const end = buf.readUInt32BE(g + 4);
    // A group maps to consecutive glyph ids; id 0 is .notdef, i.e. not covered.
    if (buf.readUInt32BE(g + 8) === 0) continue;
    for (let cp = start; cp <= end; cp += 1) out.add(cp);
  }
}

function readFormat4(buf, offset, out) {
  const segCount = buf.readUInt16BE(offset + 6) / 2;
  const endAt = offset + 14;
  const startAt = endAt + segCount * 2 + 2;
  const deltaAt = startAt + segCount * 2;
  const rangeAt = deltaAt + segCount * 2;

  for (let seg = 0; seg < segCount; seg += 1) {
    const end = buf.readUInt16BE(endAt + seg * 2);
    const start = buf.readUInt16BE(startAt + seg * 2);
    if (start === 0xffff) continue;
    const delta = buf.readInt16BE(deltaAt + seg * 2);
    const rangeOffset = buf.readUInt16BE(rangeAt + seg * 2);

    for (let cp = start; cp <= end; cp += 1) {
      let glyph;
      if (rangeOffset === 0) {
        glyph = (cp + delta) & 0xffff;
      } else {
        const at = rangeAt + seg * 2 + rangeOffset + (cp - start) * 2;
        if (at + 1 >= buf.length) continue;
        glyph = buf.readUInt16BE(at);
        if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
      }
      if (glyph !== 0) out.add(cp);
    }
  }
}
