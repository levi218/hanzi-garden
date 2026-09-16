/**
 * Rasterises the brand assets that have to exist as real files: PWA icons,
 * the Apple touch icon, and the Open Graph card.
 *
 * Run at authoring time, not build time — the outputs are committed. That
 * keeps `next build` fast and, more importantly, keeps the OG card's URL
 * stable, which matters because social crawlers cache it aggressively.
 *
 *   node scripts/build-brand-assets.mjs
 *
 * Hanzi are drawn from the Make Me a Hanzi stroke outlines in public/strokes
 * rather than set in a font: satori would need a full CJK font embedded to
 * render 汉字, and the path data is already here.
 */
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { ImageResponse } from "next/og.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");

/** Palette, kept in step with the light theme in app/globals.css. */
const PAPER = "#fbf6ee";
const INK = "#1d1813";
const SEAL = "#c0442f";
const MUTED = "#7a6a58";
const LINE = "#e8dcc7";

/* ------------------------------------------------------------------ *
 * Hanzi as SVG
 * ------------------------------------------------------------------ */

/** Make Me a Hanzi draws into a 1024 box with y pointing up from y = 900. */
const HANZI_TRANSFORM = "scale(1, -1) translate(0, -900)";

async function strokePaths(char) {
  const slug = `u${char.codePointAt(0).toString(16).padStart(4, "0")}`;
  const raw = await readFile(join(publicDir, "strokes", `${slug}.json`), "utf8");
  return JSON.parse(raw).strokes;
}

/**
 * One `<svg>` holding `chars` side by side, as a base64 data URI.
 * satori rasterises this through resvg, so no font is involved.
 */
async function hanziDataUri(chars, fill) {
  const glyphs = await Promise.all([...chars].map(strokePaths));
  const width = 1024 * glyphs.length;
  const body = glyphs
    .map(
      (paths, i) =>
        `<g transform="translate(${i * 1024}, 0) ${HANZI_TRANSFORM}" fill="${fill}">` +
        paths.map((d) => `<path d="${d}"/>`).join("") +
        `</g>`,
    )
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} 1024" width="${width}" height="1024">${body}</svg>`;
  return {
    uri: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    ratio: glyphs.length,
  };
}

/* ------------------------------------------------------------------ *
 * Rendering
 * ------------------------------------------------------------------ */

const h = (type, props, ...children) => ({
  type,
  props: { ...props, children: children.length <= 1 ? children[0] : children },
});

/**
 * Wrap a PNG in an ICO container.
 *
 * Everything since Windows Vista reads PNG-compressed .ico, so this is a
 * 22-byte header in front of the 32x32 file rather than a second encoder.
 * It exists because plenty of crawlers and feed readers request /favicon.ico
 * flat out, ignoring the <link rel="icon"> tags entirely.
 */
function icoWrap(png, size) {
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // one image
  header.writeUInt8(size, 6);
  header.writeUInt8(size, 7);
  header.writeUInt8(0, 8); // palette size: not paletted
  header.writeUInt8(0, 9); // reserved
  header.writeUInt16LE(1, 10); // colour planes
  header.writeUInt16LE(32, 12); // bits per pixel
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(header.length, 18);
  return Buffer.concat([header, png]);
}

async function render(element, width, height, file) {
  const png = await new ImageResponse(element, { width, height }).arrayBuffer();
  await writeFile(join(publicDir, file), Buffer.from(png));
  console.log(`  ${file}  ${width}x${height}  ${(png.byteLength / 1024).toFixed(1)} kB`);
}

/**
 * The app icon: a seal-red tile with the 木 -like mark from app/icon.svg.
 * `pad` leaves the safe area a maskable Android icon needs (the launcher may
 * crop up to 20% off every edge).
 */
function iconTile(size, { pad = 0, radius = size * 0.22 } = {}) {
  const inner = size - pad * 2;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="${inner}" height="${inner}">
    <g fill="none" stroke="${PAPER}" stroke-width="5" stroke-linecap="round">
      <path d="M22 17h20"/><path d="M32 10v7"/><path d="M18 30h28"/><path d="M32 30v24"/>
    </g>
  </svg>`;
  return h(
    "div",
    {
      style: {
        display: "flex",
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        background: SEAL,
        borderRadius: pad > 0 ? 0 : radius,
      },
    },
    h("img", {
      width: inner,
      height: inner,
      src: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`,
    }),
  );
}

async function ogCard() {
  const title = await hanziDataUri("汉字", INK);
  const seal = await hanziDataUri("园", PAPER);

  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        width: 1200,
        height: 630,
        padding: "64px 72px",
        background: PAPER,
        fontFamily: "sans-serif",
      },
    },
    // Top: the seal, then the wordmark.
    h(
      "div",
      { style: { display: "flex", flexDirection: "column" } },
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 20 } },
        h(
          "div",
          {
            style: {
              display: "flex",
              width: 76,
              height: 76,
              alignItems: "center",
              justifyContent: "center",
              background: SEAL,
              borderRadius: 16,
            },
          },
          h("img", { width: 48, height: 48, src: seal.uri }),
        ),
        h(
          "div",
          {
            style: {
              display: "flex",
              fontSize: 22,
              letterSpacing: 3,
              textTransform: "uppercase",
              color: MUTED,
            },
          },
          "HSK 1 – 3 · 565 characters",
        ),
      ),
      h(
        "div",
        { style: { display: "flex", alignItems: "center", gap: 28, marginTop: 44 } },
        h("img", { height: 132, width: 132 * title.ratio, src: title.uri }),
        h(
          "div",
          { style: { display: "flex", fontSize: 108, fontWeight: 700, color: SEAL } },
          "Garden",
        ),
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            marginTop: 32,
            maxWidth: 900,
            fontSize: 32,
            lineHeight: 1.4,
            color: MUTED,
          },
        },
        "Every character with its roots, its story, and four games that turn reading it into remembering it.",
      ),
    ),
    // Bottom: the four games, as a quiet footer rule.
    h(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 16,
          paddingTop: 28,
          borderTop: `2px solid ${LINE}`,
          fontSize: 24,
          color: MUTED,
        },
      },
      ...["Alchemy", "Imposter", "Rhythm", "Territory"].flatMap((name, i) => [
        ...(i > 0
          ? [
              h("div", {
                style: {
                  display: "flex",
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  background: LINE,
                },
              }),
            ]
          : []),
        h("div", { style: { display: "flex" } }, name),
      ]),
    ),
  );
}

console.log("Writing brand assets to public/");
await render(iconTile(32, { radius: 6 }), 32, 32, "favicon-32.png");
await writeFile(
  join(publicDir, "favicon.ico"),
  icoWrap(await readFile(join(publicDir, "favicon-32.png")), 32),
);
console.log("  favicon.ico  32x32");
await render(iconTile(96, { radius: 20 }), 96, 96, "favicon-96.png");
await render(iconTile(192), 192, 192, "icon-192.png");
await render(iconTile(512), 512, 512, "icon-512.png");
await render(iconTile(512, { pad: 90 }), 512, 512, "icon-maskable-512.png");
await render(iconTile(180, { radius: 0 }), 180, 180, "apple-icon.png");
await render(await ogCard(), 1200, 630, "og.png");
