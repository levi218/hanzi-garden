/**
 * Territory Map — the hex layout maths and the question generator.
 *
 * Kept deliberately free of *runtime* imports (the only import is a type, which
 * the compiler erases). The layout is the one part of this game that is easy to
 * get subtly wrong — overlapping tiles, gaps, a province that wraps around the
 * map — so it has to stay runnable from a plain node script, with no React,
 * no JSON data file and no path-alias resolution in the way.
 */

import type { CharState } from "@/lib/progress";
import type { CharacterEntry } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * Hex geometry
 *
 * Pointy-top hexes in axial coordinates (q, r). Pointy-top is the right
 * choice here because the tiles carry a single tall glyph and the map is
 * usually wider than it is tall on a phone held upright.
 *
 * The direction list below is ordered by pixel angle: direction k points at
 * -60k degrees (0 = east, 1 = north-east, ... 5 = south-east). The border
 * tracing further down depends on that, so do not reshuffle it.
 * ------------------------------------------------------------------ */

export interface Axial {
  q: number;
  r: number;
}

export const HEX_DIRECTIONS: readonly Axial[] = [
  { q: 1, r: 0 }, // E
  { q: 1, r: -1 }, // NE
  { q: 0, r: -1 }, // NW
  { q: -1, r: 0 }, // W
  { q: -1, r: 1 }, // SW
  { q: 0, r: 1 }, // SE
];

/** Circumradius of a tile, in SVG user units. The viewBox does the scaling. */
export const HEX_SIZE = 10;

const SQRT3 = Math.sqrt(3);

function cellKey(q: number, r: number): string {
  return `${q},${r}`;
}

/** Axial → pixel centre for a pointy-top grid. */
export function axialToPixel(q: number, r: number, size = HEX_SIZE) {
  return { x: size * SQRT3 * (q + r / 2), y: size * 1.5 * r };
}

/** Steps between two hexes (the cube distance, expressed in axial terms). */
export function hexDistance(a: Axial, b: Axial): number {
  const dq = a.q - b.q;
  const dr = a.r - b.r;
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

function corner(cx: number, cy: number, size: number, angleDeg: number) {
  const rad = (Math.PI / 180) * angleDeg;
  return { x: cx + size * Math.cos(rad), y: cy + size * Math.sin(rad) };
}

/** The six corners of a pointy-top hex, starting east-south-east. */
export function hexPolygonPoints(size = HEX_SIZE, cx = 0, cy = 0): string {
  const pts: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    const p = corner(cx, cy, size, -30 + 60 * i);
    pts.push(`${round(p.x)},${round(p.y)}`);
  }
  return pts.join(" ");
}

function round(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/* ------------------------------------------------------------------ *
 * Layout
 *
 * Characters are grouped into provinces by radical, and each province is
 * packed as a compact blob welded onto the edge of the landmass built so far.
 * That is what makes adjacency mean something: your neighbours share a radical
 * with you, and within a province tiles are laid down in HSK-then-stroke
 * order, so pushing outward inside a province is also pushing from easier
 * characters to harder ones.
 * ------------------------------------------------------------------ */

export interface HexTile {
  index: number;
  entry: CharacterEntry;
  char: string;
  q: number;
  r: number;
  x: number;
  y: number;
  /** Index into `layout.provinces`. */
  province: number;
  /** Neighbour tile index per direction, or -1 when that side is coastline. */
  links: number[];
}

export interface Province {
  index: number;
  /** The radical every member shares — the province's name. */
  radical: string;
  tiles: number[];
  /** Label anchor: the mean of the member centres. */
  cx: number;
  cy: number;
  /** SVG path of the province outline, for the map's border ink. */
  border: string;
}

export interface TerritoryLayout {
  key: string;
  size: number;
  tiles: HexTile[];
  provinces: Province[];
  byChar: Map<string, number>;
  /** Shared polygon geometry — every tile is the same shape, drawn translated. */
  points: string;
  innerPoints: string;
  outerPoints: string;
  bounds: { minX: number; minY: number; width: number; height: number };
}

interface Placement {
  q: number;
  r: number;
  entry: CharacterEntry;
  province: number;
}

/**
 * Pick the next cell for a province: hug your own province first (that is what
 * keeps a province a blob rather than a snake), then hug the rest of the
 * landmass, then stay near the province centroid, then near the map origin.
 * Every tie-break is deterministic, so the same level always draws the same map.
 */
function bestCell(
  candidates: Map<string, Axial>,
  occupied: Map<string, number>,
  ownCells: Axial[],
  centroid: { q: number; r: number },
): Axial {
  let best: Axial | null = null;
  let bestScore: number[] = [];

  for (const [key, cell] of candidates) {
    if (occupied.has(key)) continue;
    let own = 0;
    let total = 0;
    for (const dir of HEX_DIRECTIONS) {
      const nKey = cellKey(cell.q + dir.q, cell.r + dir.r);
      const at = occupied.get(nKey);
      if (at === undefined) continue;
      total += 1;
      if (ownCells.some((c) => cellKey(c.q, c.r) === nKey)) own += 1;
    }
    const score = [
      -own,
      -total,
      hexDistance(cell, { q: centroid.q, r: centroid.r }),
      hexDistance(cell, { q: 0, r: 0 }),
      cell.q,
      cell.r,
    ];
    if (best === null || lessThan(score, bestScore)) {
      best = cell;
      bestScore = score;
    }
  }

  // Only possible if the candidate set was empty, which the callers prevent.
  return best ?? { q: 0, r: 0 };
}

function lessThan(a: number[], b: number[]): boolean {
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return a[i] < b[i];
  }
  return false;
}

/** Free cells touching anything already placed — the coastline. */
function coastline(occupied: Map<string, number>, cells: Axial[]): Map<string, Axial> {
  const out = new Map<string, Axial>();
  for (const cell of cells) {
    for (const dir of HEX_DIRECTIONS) {
      const q = cell.q + dir.q;
      const r = cell.r + dir.r;
      const key = cellKey(q, r);
      if (!occupied.has(key)) out.set(key, { q, r });
    }
  }
  return out;
}

export function buildLayout(
  entries: CharacterEntry[],
  key = "layout",
  size = HEX_SIZE,
): TerritoryLayout {
  // Provinces, biggest first: the crowded radicals form the heartland and the
  // one-off radicals become the little border states around the rim.
  const groups = new Map<string, CharacterEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.radical);
    if (list) list.push(entry);
    else groups.set(entry.radical, [entry]);
  }
  const ordered = [...groups.entries()].sort(
    (a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]),
  );

  const occupied = new Map<string, number>();
  const placements: Placement[] = [];
  const allCells: Axial[] = [];

  ordered.forEach(([, members], provinceIndex) => {
    const sorted = [...members].sort(
      (a, b) =>
        a.hsk - b.hsk ||
        a.strokes - b.strokes ||
        a.char.localeCompare(b.char, "zh"),
    );
    const ownCells: Axial[] = [];
    let sumQ = 0;
    let sumR = 0;

    for (const entry of sorted) {
      let cell: Axial;
      if (allCells.length === 0) {
        cell = { q: 0, r: 0 };
      } else {
        const centroid = ownCells.length
          ? { q: Math.round(sumQ / ownCells.length), r: Math.round(sumR / ownCells.length) }
          : { q: 0, r: 0 };
        // Seeding a province looks at the whole coastline; growing it only
        // looks at its own edge, which is what keeps provinces contiguous.
        const pool = ownCells.length
          ? coastline(occupied, ownCells)
          : coastline(occupied, allCells);
        cell = bestCell(pool, occupied, ownCells, centroid);
      }

      const at = placements.length;
      occupied.set(cellKey(cell.q, cell.r), at);
      placements.push({ q: cell.q, r: cell.r, entry, province: provinceIndex });
      ownCells.push(cell);
      allCells.push(cell);
      sumQ += cell.q;
      sumR += cell.r;
    }
  });

  const tiles: HexTile[] = placements.map((p, index) => {
    const { x, y } = axialToPixel(p.q, p.r, size);
    return {
      index,
      entry: p.entry,
      char: p.entry.char,
      q: p.q,
      r: p.r,
      x: round(x),
      y: round(y),
      province: p.province,
      links: [],
    };
  });

  for (const tile of tiles) {
    tile.links = HEX_DIRECTIONS.map((dir) => {
      const at = occupied.get(cellKey(tile.q + dir.q, tile.r + dir.r));
      return at === undefined ? -1 : at;
    });
  }

  const provinces: Province[] = ordered.map(([radical], index) => {
    const members = tiles.filter((t) => t.province === index);
    const cx = members.reduce((sum, t) => sum + t.x, 0) / (members.length || 1);
    const cy = members.reduce((sum, t) => sum + t.y, 0) / (members.length || 1);
    return {
      index,
      radical,
      tiles: members.map((t) => t.index),
      cx: round(cx),
      cy: round(cy),
      border: provinceBorder(members, tiles, size),
    };
  });

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const tile of tiles) {
    minX = Math.min(minX, tile.x - size * SQRT3 * 0.5);
    maxX = Math.max(maxX, tile.x + size * SQRT3 * 0.5);
    minY = Math.min(minY, tile.y - size);
    maxY = Math.max(maxY, tile.y + size);
  }
  if (!tiles.length) {
    minX = 0;
    minY = 0;
    maxX = size;
    maxY = size;
  }

  return {
    key,
    size,
    tiles,
    provinces,
    byChar: new Map(tiles.map((t) => [t.char, t.index])),
    points: hexPolygonPoints(size),
    innerPoints: hexPolygonPoints(size * 0.68),
    outerPoints: hexPolygonPoints(size * 1.12),
    bounds: {
      minX: round(minX),
      minY: round(minY),
      width: round(maxX - minX),
      height: round(maxY - minY),
    },
  };
}

/**
 * Outline of a province: every tile edge whose far side is a different
 * province (or open sea). Direction k faces -60k degrees, so the edge it
 * shares runs between the corners at -60k-30 and -60k+30.
 */
function provinceBorder(members: HexTile[], tiles: HexTile[], size: number): string {
  const parts: string[] = [];
  for (const tile of members) {
    for (let k = 0; k < 6; k += 1) {
      const link = tile.links[k];
      if (link >= 0 && tiles[link].province === tile.province) continue;
      const angle = -60 * k;
      const a = corner(tile.x, tile.y, size, angle - 30);
      const b = corner(tile.x, tile.y, size, angle + 30);
      parts.push(`M${round(a.x)} ${round(a.y)}L${round(b.x)} ${round(b.y)}`);
    }
  }
  return parts.join("");
}

/** Layouts are static per character set, so build each one at most once. */
const layoutCache = new Map<string, TerritoryLayout>();

export function getLayout(key: string, entries: CharacterEntry[]): TerritoryLayout {
  const cached = layoutCache.get(key);
  if (cached) return cached;
  const built = buildLayout(entries, key);
  layoutCache.set(key, built);
  return built;
}

/* ------------------------------------------------------------------ *
 * Keyboard navigation
 * ------------------------------------------------------------------ */

export type ArrowKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

/**
 * Arrow keys on a pointy-top grid: left/right are exact, up/down have to pick
 * one of two diagonals. Up prefers NW and down prefers SE — they are exact
 * inverses, so up-then-down always lands you back where you started.
 */
const ARROW_DIRECTIONS: Record<ArrowKey, number[]> = {
  ArrowRight: [0, 1, 5],
  ArrowLeft: [3, 2, 4],
  ArrowUp: [2, 1],
  ArrowDown: [5, 4],
};

/** Next tile index for an arrow key, or the same index when we hit the coast. */
export function stepFocus(
  layout: TerritoryLayout,
  from: number,
  key: ArrowKey,
): number {
  const tile = layout.tiles[from];
  if (!tile) return from;
  for (const dir of ARROW_DIRECTIONS[key]) {
    const next = tile.links[dir];
    if (next >= 0) return next;
  }
  return from;
}

/* ------------------------------------------------------------------ *
 * Tile paint
 *
 * All fills are mixes *towards* `--card`, which is why they invert correctly
 * in dark mode for free: the hue stays, the ground under it flips.
 * ------------------------------------------------------------------ */

export const STATE_META: Record<
  CharState,
  { label: string; blurb: string; sample: number }
> = {
  unseen: {
    label: "Neutral",
    blurb: "Never attacked. Nothing known about it yet.",
    sample: 0,
  },
  shaky: {
    label: "Contested",
    blurb: "Attacked and lost, or only just met. Take it again.",
    sample: 0,
  },
  fading: {
    label: "Being reclaimed",
    blurb: "Memory has decayed past the line. Defend it soon.",
    sample: 0.35,
  },
  held: {
    label: "Held",
    blurb: "Yours for now. Every correct answer deepens the hold.",
    sample: 0.55,
  },
  mastered: {
    label: "Fortified",
    blurb: "Deep and fresh. Only the hardest questions are asked here.",
    sample: 1,
  },
};

/** Draw order — a legend reads best from empty land to fortress. */
export const STATE_ORDER: CharState[] = [
  "unseen",
  "shaky",
  "fading",
  "held",
  "mastered",
];

export function tileFill(state: CharState, mastery: number): string {
  const m = Math.max(0, Math.min(1, mastery));
  switch (state) {
    case "shaky":
      return `color-mix(in oklab, var(--seal) ${Math.round(20 + 8 * m)}%, var(--card))`;
    case "fading":
      return `color-mix(in oklab, var(--gold) ${Math.round(24 + 26 * m)}%, var(--card))`;
    case "held":
      return `color-mix(in oklab, var(--jade) ${Math.round(30 + 28 * m)}%, var(--card))`;
    case "mastered":
      return `color-mix(in oklab, var(--jade) ${Math.round(66 + 22 * m)}%, var(--card))`;
    default:
      return "var(--card-soft)";
  }
}

export function tileStroke(state: CharState): string {
  switch (state) {
    case "shaky":
      return "color-mix(in oklab, var(--seal) 55%, transparent)";
    case "fading":
      return "color-mix(in oklab, var(--gold) 60%, transparent)";
    case "held":
    case "mastered":
      return "color-mix(in oklab, var(--jade) 55%, transparent)";
    default:
      return "color-mix(in oklab, var(--foreground) 12%, transparent)";
  }
}

/** Fortified tiles carry a dark enough fill that the glyph has to flip. */
export function tileTextFill(state: CharState): string {
  if (state === "mastered") return "var(--card)";
  if (state === "unseen") return "color-mix(in oklab, var(--muted) 75%, transparent)";
  return "var(--foreground)";
}

/* ------------------------------------------------------------------ *
 * Decay readouts
 * ------------------------------------------------------------------ */

/**
 * When will this character cross into "fading"? `charState` calls it at
 * retention 0.4, and retention is a plain exponential, so two probes of the
 * caller's retention function are enough to solve for the half-life without
 * this module having to know the tier table in lib/progress.
 */
export const FADING_THRESHOLD = 0.4;

export function fadingAt(
  lastCorrect: number,
  retentionAt: (now: number) => number,
): number | null {
  if (!lastCorrect) return null;
  const DAY = 86_400_000;
  const probe = retentionAt(lastCorrect + DAY);
  if (!(probe > 0) || probe >= 1) return null;
  const halfLife = -DAY / Math.log2(probe);
  return lastCorrect + halfLife * Math.log2(1 / FADING_THRESHOLD);
}

/** "in 3 days" / "2 hours ago" — short, human, no dependencies. */
export function relativeTime(target: number, now: number): string {
  const delta = target - now;
  const abs = Math.abs(delta);
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  let value: number;
  let unit: string;
  if (abs < hour) {
    value = Math.max(1, Math.round(abs / minute));
    unit = "min";
  } else if (abs < day) {
    value = Math.round(abs / hour);
    unit = value === 1 ? "hour" : "hours";
  } else if (abs < 60 * day) {
    value = Math.round(abs / day);
    unit = value === 1 ? "day" : "days";
  } else {
    value = Math.round(abs / (30 * day));
    unit = value === 1 ? "month" : "months";
  }
  return delta >= 0 ? `in ${value} ${unit}` : `${value} ${unit} ago`;
}

/* ------------------------------------------------------------------ *
 * Campaign ordering
 * ------------------------------------------------------------------ */

export interface CampaignInput {
  layout: TerritoryLayout;
  /** `reviewUrgency` for a character — higher means more overdue. */
  urgency: (char: string) => number;
  /** Is this tile currently ours (held or fortified)? */
  held: (char: string) => boolean;
  count: number;
  /** Restrict the run to these tile indices (used by the "defend" run). */
  only?: number[];
  rng?: () => number;
}

/** Share of a tile's existing neighbours that we already hold, 0-1. */
export function frontierPressure(
  layout: TerritoryLayout,
  index: number,
  held: (char: string) => boolean,
): number {
  const tile = layout.tiles[index];
  if (!tile) return 0;
  let seen = 0;
  let ours = 0;
  for (const link of tile.links) {
    if (link < 0) continue;
    seen += 1;
    if (held(layout.tiles[link].char)) ours += 1;
  }
  return seen ? ours / seen : 0;
}

/**
 * The campaign queue. Overdue material still dominates — this is a review
 * queue first — but two map-shaped nudges break the ties: tiles touching land
 * we already hold, and tiles in a province that is nearly complete. The run
 * therefore spreads out of a foothold and finishes provinces instead of
 * scattering over the whole map.
 */
export function orderCampaign({
  layout,
  urgency,
  held,
  count,
  only,
  rng = Math.random,
}: CampaignInput): HexTile[] {
  const provinceProgress = layout.provinces.map((province) => {
    if (!province.tiles.length) return 0;
    const ours = province.tiles.filter((i) => held(layout.tiles[i].char)).length;
    const ratio = ours / province.tiles.length;
    // Only a province that is started but unfinished deserves a nudge.
    return ratio > 0 && ratio < 1 ? ratio : 0;
  });

  const pool = only ?? layout.tiles.map((t) => t.index);
  return pool
    .map((index) => {
      const tile = layout.tiles[index];
      const score =
        urgency(tile.char) +
        0.4 * frontierPressure(layout, index, held) +
        0.3 * provinceProgress[tile.province] +
        rng() * 0.25;
      return { tile, score };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((entry) => entry.tile);
}

/* ------------------------------------------------------------------ *
 * Questions
 * ------------------------------------------------------------------ */

export type QuestionKind =
  | "char-meaning"
  | "meaning-char"
  | "char-pinyin"
  | "word-blank";

export interface QuizOption {
  /** The character the option was built from — unique inside one question. */
  id: string;
  text: string;
  /** Render `text` with the hanzi face at display size. */
  hanzi: boolean;
  note?: string;
}

export interface Question {
  char: string;
  kind: QuestionKind;
  difficulty: 1 | 2 | 3;
  instruction: string;
  prompt: string;
  promptHanzi: boolean;
  hint?: string;
  options: QuizOption[];
  answerId: string;
}

/**
 * How hard a tile is to take. A neutral tile only has to be recognised; a
 * fortified one has to be defended against a question that would be unfair on
 * a character you met five minutes ago.
 */
export function difficultyFor(state: CharState): 1 | 2 | 3 {
  switch (state) {
    case "unseen":
    case "shaky":
      return 1;
    case "mastered":
      return 3;
    default:
      return 2;
  }
}

const OPTION_COUNT: Record<1 | 2 | 3, number> = { 1: 3, 2: 4, 3: 5 };

/** Local copy of `plainText` — this module stays runtime-import-free on purpose. */
function toneless(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

function firstDef(entry: CharacterEntry): string {
  return entry.meanings[0]?.def ?? entry.char;
}

/** Visual + semantic nearness, used for "which character is this?" decoys. */
function charNearness(a: CharacterEntry, b: CharacterEntry): number {
  let score = 0;
  if (a.radical === b.radical) score += 3;
  const parts = new Set(a.components.map((c) => c.part));
  if (b.components.some((c) => parts.has(c.part))) score += 2;
  if (Math.abs(a.strokes - b.strokes) <= 1) score += 1;
  if (a.hsk === b.hsk) score += 0.5;
  return score;
}

/** Sound-alike nearness: same syllable with a different tone is the killer. */
function pinyinNearness(a: CharacterEntry, b: CharacterEntry): number {
  const pa = toneless(a.pinyin);
  const pb = toneless(b.pinyin);
  if (pa === pb) return 6;
  let score = 0;
  if (pa.slice(-2) === pb.slice(-2)) score += 3; // shared final
  if (pa[0] === pb[0]) score += 1.5; // shared initial
  if (Math.abs(pa.length - pb.length) <= 1) score += 0.5;
  return score;
}

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Top-scoring decoys with a little jitter, so a character does not always get
 * the exact same wrong answers next to it.
 */
function pickDecoys(
  entry: CharacterEntry,
  pool: CharacterEntry[],
  count: number,
  score: (a: CharacterEntry, b: CharacterEntry) => number,
  taken: (candidate: CharacterEntry) => string,
  rng: () => number,
): CharacterEntry[] {
  const used = new Set([taken(entry)]);
  const ranked = pool
    .filter((candidate) => candidate.char !== entry.char)
    .map((candidate) => ({ candidate, score: score(entry, candidate) + rng() * 1.5 }))
    .sort((a, b) => b.score - a.score);

  const out: CharacterEntry[] = [];
  for (const { candidate } of ranked) {
    const label = taken(candidate);
    if (used.has(label)) continue; // never show the same text twice
    used.add(label);
    out.push(candidate);
    if (out.length === count) break;
  }
  return out;
}

function buildOptions(
  entry: CharacterEntry,
  decoys: CharacterEntry[],
  toOption: (candidate: CharacterEntry) => QuizOption,
  rng: () => number,
): { options: QuizOption[]; answerId: string } {
  const answer = toOption(entry);
  return {
    options: shuffle([answer, ...decoys.map(toOption)], rng),
    answerId: answer.id,
  };
}

function wordWithChar(entry: CharacterEntry) {
  return entry.words.find((w) => w.word.includes(entry.char));
}

const BLANK = "▢"; // ▢ — reads as a gap, not as a character

/**
 * Build one question about `entry`. `pool` supplies the decoys and should be
 * the characters of the level being played, so the wrong answers are always
 * things the learner could plausibly have confused it with.
 */
export function makeQuestion(
  entry: CharacterEntry,
  pool: CharacterEntry[],
  difficulty: 1 | 2 | 3,
  rng: () => number = Math.random,
): Question {
  const kind = pickKind(entry, difficulty, rng);
  const count = OPTION_COUNT[difficulty] - 1;

  if (kind === "char-pinyin") {
    const decoys = pickDecoys(entry, pool, count, pinyinNearness, (c) => c.pinyin, rng);
    const { options, answerId } = buildOptions(
      entry,
      decoys,
      (c) => ({ id: c.char, text: c.pinyin, hanzi: false }),
      rng,
    );
    return {
      char: entry.char,
      kind,
      difficulty,
      instruction: "How is it read?",
      prompt: entry.char,
      promptHanzi: true,
      options,
      answerId,
    };
  }

  if (kind === "meaning-char") {
    const decoys = pickDecoys(entry, pool, count, charNearness, (c) => c.char, rng);
    const { options, answerId } = buildOptions(
      entry,
      decoys,
      (c) => ({ id: c.char, text: c.char, hanzi: true, note: c.pinyin }),
      rng,
    );
    return {
      char: entry.char,
      kind,
      difficulty,
      instruction: "Which character is it?",
      prompt: firstDef(entry),
      promptHanzi: false,
      hint: entry.meanings[0]?.pos,
      options,
      answerId,
    };
  }

  if (kind === "word-blank") {
    const word = wordWithChar(entry);
    if (word) {
      const decoys = pickDecoys(entry, pool, count, charNearness, (c) => c.char, rng);
      const { options, answerId } = buildOptions(
        entry,
        decoys,
        (c) => ({ id: c.char, text: c.char, hanzi: true, note: c.pinyin }),
        rng,
      );
      return {
        char: entry.char,
        kind,
        difficulty,
        instruction: "Fill the gap",
        prompt: word.word.split(entry.char).join(BLANK),
        promptHanzi: true,
        hint: `${word.pinyin} — ${word.meaning}`,
        options,
        answerId,
      };
    }
  }

  // Default: character → meaning.
  const decoys = pickDecoys(entry, pool, count, charNearness, firstDef, rng);
  const { options, answerId } = buildOptions(
    entry,
    decoys,
    (c) => ({ id: c.char, text: firstDef(c), hanzi: false, note: c.meanings[0]?.pos }),
    rng,
  );
  return {
    char: entry.char,
    kind: "char-meaning",
    difficulty,
    instruction: "What does it mean?",
    prompt: entry.char,
    promptHanzi: true,
    options,
    answerId,
  };
}

/**
 * Question kinds by difficulty. Recognition (character → meaning) is the
 * gentlest; production-flavoured prompts (meaning → character, a word with a
 * hole in it) are what a fortified tile has to survive.
 */
function pickKind(
  entry: CharacterEntry,
  difficulty: 1 | 2 | 3,
  rng: () => number,
): QuestionKind {
  const hasWord = Boolean(wordWithChar(entry));
  const table: QuestionKind[] =
    difficulty === 1
      ? ["char-meaning", "char-meaning", "char-pinyin"]
      : difficulty === 2
        ? ["meaning-char", "char-pinyin", "char-meaning", "meaning-char"]
        : hasWord
          ? ["word-blank", "word-blank", "meaning-char", "char-pinyin"]
          : ["meaning-char", "meaning-char", "char-pinyin"];
  return table[Math.floor(rng() * table.length)] ?? "char-meaning";
}
