/**
 * Look-alike characters for the Spot the Imposter game.
 *
 * Two sources feed one pool:
 *
 *  1. `data/confusables.json` — hand-curated classic sets (己/已/巳, 请/清/情/晴,
 *     日/曰 …) with a hand-written note saying exactly what to look at. A generic
 *     sentence is useless for these: nothing about the *data* tells you that 土
 *     has its long bar at the bottom, so a human has to say it.
 *  2. A similarity score computed over the whole dataset, which reaches the
 *     hundreds of pairs nobody would sit down and list (校/较, 检/脸, 饱/抱,
 *     铅/钱/铁, 矮/短 …).
 *
 * Everything here is pure — no React, no localStorage. `Math.random` only ever
 * enters through the `rng` parameter, which callers must supply from an event
 * handler (React Compiler treats randomness during render as an error).
 */

import confusablesData from "@/data/confusables.json";
import { characters, plainText, type HskLevel } from "@/lib/characters";
import type { CharacterEntry } from "@/lib/types";

/* ------------------------------------------------------------------ *
 * Shapes
 * ------------------------------------------------------------------ */

/** Everything the UI needs to render one tile and its reveal. */
export interface ConfusableChar {
  char: string;
  pinyin: string;
  meaning: string;
  /** Null for characters carried in `outside` — we only know the gloss. */
  strokes: number | null;
  hsk: HskLevel | null;
  /** False for the out-of-dataset distractors; those never become the answer. */
  inDataset: boolean;
}

export interface ConfusableGroup {
  /** Every member. For generated groups, sorted most-similar-first to `anchor`. */
  chars: string[];
  /** What to look at to tell them apart. */
  note: string;
  /** 0-1. How hard the set is; drives the difficulty curve. */
  tight: number;
  source: "curated" | "generated";
  /** Generated groups only: the character the similarity ranking is relative to. */
  anchor?: string;
}

interface OutsideEntry {
  pinyin: string;
  meaning: string;
}

interface CuratedEntry {
  chars: string;
  tight: number;
  note: string;
}

const OUTSIDE = confusablesData.outside as Record<string, OutsideEntry>;
const CURATED = confusablesData.groups as CuratedEntry[];

const ENTRIES = new Map<string, CharacterEntry>(characters.map((c) => [c.char, c]));

/** Look up display data for any character used by the game, dataset or not. */
export function describe(char: string): ConfusableChar {
  const entry = ENTRIES.get(char);
  if (entry) {
    return {
      char,
      pinyin: entry.pinyin,
      meaning: entry.meanings[0]?.def ?? "",
      strokes: entry.strokes,
      hsk: entry.hsk,
      inDataset: true,
    };
  }
  const outside = OUTSIDE[char];
  return {
    char,
    pinyin: outside?.pinyin ?? "",
    meaning: outside?.meaning ?? "",
    strokes: null,
    hsk: null,
    inDataset: false,
  };
}

/* ------------------------------------------------------------------ *
 * Visual similarity
 *
 * There is no stroke-shape data in this dataset, so "looks alike" has to be
 * inferred. Four signals, and the weights below were tuned by dumping the top
 * neighbours of a few hundred characters and reading them:
 *
 *   shared components  — the dominant signal, but weighted by *rarity*. Two
 *                        characters sharing 青 (6 uses) are near-twins; two
 *                        sharing 口 (41 uses) merely rhyme visually.
 *   stroke proximity   — a 5-stroke and a 15-stroke character never confuse.
 *   shared sound       — a shared phonetic almost always means a shared
 *                        component, and same-sound pairs are the ones learners
 *                        actually mix up in writing.
 *   same part count    — 请/清 (two parts each) sit closer than 请/警.
 * ------------------------------------------------------------------ */

/**
 * Combining forms folded onto their parent, so 亻/人 and 氵/水 count as shared.
 * The dataset is inconsistent about which form it stores in `radical` vs
 * `components`, so this normalisation is load-bearing, not cosmetic.
 */
const RADICAL_FORMS: Record<string, string> = {
  "亻": "人",
  "彳": "人",
  "忄": "心",
  "氵": "水",
  "讠": "言",
  "钅": "金",
  "艹": "艸",
  "扌": "手",
  "犭": "犬",
  "纟": "糸",
  "饣": "食",
  "衤": "衣",
  "礻": "示",
  "灬": "火",
};

const normPart = (part: string): string => RADICAL_FORMS[part] ?? part;

const PARTS = new Map<string, Set<string>>();
for (const entry of characters) {
  const set = new Set<string>();
  for (const component of entry.components) set.add(normPart(component.part));
  set.add(normPart(entry.radical));
  PARTS.set(entry.char, set);
}

const DOC_FREQ = new Map<string, number>();
for (const set of PARTS.values()) {
  for (const part of set) DOC_FREQ.set(part, (DOC_FREQ.get(part) ?? 0) + 1);
}

const MAX_IDF = Math.log(characters.length);
const idf = (part: string): number =>
  Math.log(characters.length / (DOC_FREQ.get(part) ?? 1));

/** Toneless pinyin minus the initial — 请 qǐng and 名 míng share the final "ing". */
function finalOf(pinyin: string): string {
  return plainText(pinyin).replace(/^(zh|ch|sh|[bpmfdtnlgkhjqxrzcsyw])/, "");
}

// Normalising pinyin means an NFD pass and two regexes; the pair sweep below
// would run it 300k times, so it happens once per character instead.
const SOUND = new Map<string, { plain: string; final: string }>(
  characters.map((c) => [c.char, { plain: plainText(c.pinyin), final: finalOf(c.pinyin) }]),
);

interface PairScore {
  score: number;
  /** The rarest component the two share, if any — what the reveal points at. */
  sharedPart: string;
  /** `rarest shared idf` normalised to 0-1. */
  rare: number;
}

function scorePair(a: CharacterEntry, b: CharacterEntry): PairScore {
  const pa = PARTS.get(a.char)!;
  const pb = PARTS.get(b.char)!;
  let sum = 0;
  let best = 0;
  let sharedPart = "";
  for (const part of pa) {
    if (!pb.has(part)) continue;
    const weight = idf(part);
    sum += weight;
    if (weight > best) {
      best = weight;
      sharedPart = part;
    }
  }

  const shared = Math.min(1, sum / MAX_IDF);
  const rare = Math.min(1, best / MAX_IDF);
  const strokes = Math.max(0, 1 - Math.abs(a.strokes - b.strokes) / 4);
  const sa = SOUND.get(a.char)!;
  const sb = SOUND.get(b.char)!;
  const sameSound = sa.plain === sb.plain;
  const sound = sameSound ? 1 : sa.final === sb.final ? 0.35 : 0;
  const shape = a.components.length === b.components.length ? 1 : 0.5;

  const score = 1.9 * shared + 1.3 * rare + 1.5 * strokes + 0.7 * sound + 0.5 * shape;
  return { score, sharedPart, rare: sameSound ? Math.max(rare, 0.5) : rare };
}

/**
 * Floors, both found by eyeballing the output rather than by theory.
 * Below MIN_SCORE the pairs stop looking alike at all (了/事, 写/学). MIN_RARE
 * throws out pairs whose only common ground is a very common radical, which is
 * what produced the worst distractors before it existed.
 */
const MIN_SCORE = 3.4;
const MIN_RARE = 0.35;
/** The observed top of the score range — 快/块 lands at 5.35. */
const MAX_SCORE = 5.4;
const MAX_NEIGHBOURS = 4;

const normalizeTightness = (score: number): number =>
  Math.min(1, Math.max(0, (score - MIN_SCORE) / (MAX_SCORE - MIN_SCORE)));

/* ------------------------------------------------------------------ *
 * Group index
 * ------------------------------------------------------------------ */

interface Index {
  /** char -> every group it belongs to, curated first. */
  byChar: Map<string, ConfusableGroup[]>;
  /** Dataset characters that can be the answer to at least one round. */
  targets: string[];
}

let cache: Index | null = null;

/**
 * Built lazily and once: the full sweep is ~160k pair scores, which is fine in a
 * click handler but not worth paying on first paint.
 */
function index(): Index {
  if (cache) return cache;

  const byChar = new Map<string, ConfusableGroup[]>();
  const push = (char: string, group: ConfusableGroup) => {
    const list = byChar.get(char);
    if (list) list.push(group);
    else byChar.set(char, [group]);
  };

  for (const raw of CURATED) {
    const group: ConfusableGroup = {
      chars: [...raw.chars],
      note: raw.note,
      tight: raw.tight,
      source: "curated",
    };
    for (const char of group.chars) push(char, group);
  }

  // Similarity is symmetric, so each pair is scored once and offered to both
  // sides' top-N lists. Keeping only MAX_NEIGHBOURS per character avoids
  // materialising 300k candidate objects just to throw them away.
  interface Neighbour {
    other: CharacterEntry;
    score: number;
    sharedPart: string;
  }
  const tops = new Map<string, Neighbour[]>(characters.map((c) => [c.char, []]));
  const offer = (owner: string, candidate: Neighbour) => {
    const list = tops.get(owner)!;
    if (list.length === MAX_NEIGHBOURS && candidate.score <= list[list.length - 1].score) {
      return;
    }
    let i = list.length;
    while (i > 0 && list[i - 1].score < candidate.score) i -= 1;
    list.splice(i, 0, candidate);
    if (list.length > MAX_NEIGHBOURS) list.pop();
  };

  for (let i = 0; i < characters.length; i += 1) {
    for (let j = i + 1; j < characters.length; j += 1) {
      const a = characters[i];
      const b = characters[j];
      const { score, sharedPart, rare } = scorePair(a, b);
      if (score < MIN_SCORE || rare < MIN_RARE) continue;
      offer(a.char, { other: b, score, sharedPart });
      offer(b.char, { other: a, score, sharedPart });
    }
  }

  for (const entry of characters) {
    const neighbours = tops.get(entry.char)!;
    if (neighbours.length === 0) continue;
    push(entry.char, {
      chars: [entry.char, ...neighbours.map((n) => n.other.char)],
      note: generatedNote(entry, neighbours[0].other, neighbours[0].sharedPart),
      tight: normalizeTightness(neighbours[0].score),
      source: "generated",
      anchor: entry.char,
    });
  }

  const targets = characters.map((c) => c.char).filter((char) => byChar.has(char));
  cache = { byChar, targets };
  return cache;
}

/** Every group `char` belongs to, curated ones first. */
export function groupsFor(char: string): ConfusableGroup[] {
  return index().byChar.get(char) ?? [];
}

/** Dataset characters that can be tested, optionally narrowed to one HSK level. */
export function eligibleTargets(level: HskLevel | "all"): string[] {
  const all = index().targets;
  if (level === "all") return all;
  return all.filter((char) => ENTRIES.get(char)?.hsk === level);
}

/* ------------------------------------------------------------------ *
 * Reveal text
 * ------------------------------------------------------------------ */

const partGloss = (entry: CharacterEntry, part: string): string | null => {
  const match = entry.components.find((c) => normPart(c.part) === part);
  return match ? match.meaning.split(/[;(]/)[0].trim() : null;
};

/**
 * The fallback note for a generated pair. It is only ever as good as the
 * component data, so it sticks to things that are certainly true: what the two
 * share, what they do not, and how the stroke counts compare.
 */
function generatedNote(a: CharacterEntry, b: CharacterEntry, shared: string): string {
  const parts: string[] = [];
  if (shared) {
    const gloss = partGloss(a, shared) ?? partGloss(b, shared);
    parts.push(
      `Both are built on ${shared}${gloss ? ` (${gloss})` : ""} — that part is the trap, not the clue.`,
    );
  }

  const uniqueA = a.components.find((c) => !PARTS.get(b.char)?.has(normPart(c.part)));
  const uniqueB = b.components.find((c) => !PARTS.get(a.char)?.has(normPart(c.part)));
  if (uniqueA && uniqueB) {
    parts.push(
      `${a.char} takes ${uniqueA.part} (${uniqueA.meaning.split(/[;(]/)[0].trim()}), ${b.char} takes ${uniqueB.part} (${uniqueB.meaning.split(/[;(]/)[0].trim()}).`,
    );
  }

  parts.push(
    a.strokes === b.strokes
      ? `Same stroke count (${a.strokes}) — counting will not save you here.`
      : `${a.char} is ${a.strokes} strokes, ${b.char} is ${b.strokes}.`,
  );

  return parts.join(" ");
}

/**
 * What to say after an answer. A curated note explains its own set, so it wins
 * whenever the pick is actually a member of that set; otherwise — a generated
 * group, or a distractor topped up from elsewhere — the note is derived from
 * the two characters actually on screen, which is the pair the learner just got
 * wrong.
 */
export function discriminator(
  group: ConfusableGroup,
  target: string,
  picked: string | null,
): string {
  if (!picked || picked === target) return group.note;
  if (group.source === "curated" && group.chars.includes(picked)) return group.note;
  const a = ENTRIES.get(target);
  const b = ENTRIES.get(picked);
  if (!a || !b) return group.note;
  return generatedNote(a, b, scorePair(a, b).sharedPart);
}

/* ------------------------------------------------------------------ *
 * Difficulty curve
 *
 * Three dials move together across a run, so the last rounds are a different
 * game from the first: more tiles, tighter sets, less time.
 * ------------------------------------------------------------------ */

export const RUN_ROUNDS = 18;
export const RUN_LIVES = 3;

const FIRST_SECONDS = 7;
const LAST_SECONDS = 3.2;

/** Progress through the run, 0 on the first round and 1 on the last. */
const ramp = (index: number, rounds: number): number =>
  rounds <= 1 ? 1 : Math.min(1, Math.max(0, index / (rounds - 1)));

export function roundSeconds(index: number, rounds: number = RUN_ROUNDS): number {
  return FIRST_SECONDS + (LAST_SECONDS - FIRST_SECONDS) * ramp(index, rounds);
}

/** 2 tiles while the learner finds the rhythm, 4 once they have. */
export function optionCount(index: number, rounds: number = RUN_ROUNDS): number {
  const t = ramp(index, rounds);
  if (t < 0.2) return 2;
  if (t < 0.5) return 3;
  return 4;
}

/** Which end of the tightness range this round should be drawn from. */
function wantedTightness(index: number, rounds: number): number {
  return 0.3 + 0.7 * ramp(index, rounds);
}

/* ------------------------------------------------------------------ *
 * Round building
 * ------------------------------------------------------------------ */

export interface ImposterRound {
  index: number;
  target: ConfusableChar;
  /** Shuffled; always contains the target. */
  options: ConfusableChar[];
  note: string;
  group: ConfusableGroup;
  /** Milliseconds allowed before the round counts as a miss. */
  limitMs: number;
}

type Rng = () => number;

function shuffle<T>(items: T[], rng: Rng): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * A distractor whose prompt would read the same as the target's makes the round
 * unanswerable, so drop it. Rare, but 练/炼 style pairs get close.
 */
function isAnswerable(target: ConfusableChar, other: ConfusableChar): boolean {
  return plainText(other.meaning) !== plainText(target.meaning);
}

/** Build one round around `char`, or null if it has no usable group. */
export function buildRound(
  char: string,
  index: number,
  rng: Rng,
  rounds: number = RUN_ROUNDS,
): ImposterRound | null {
  const target = describe(char);
  if (!target.inDataset) return null;

  const want = optionCount(index, rounds);
  const desired = wantedTightness(index, rounds);

  /**
   * Pick the group whose difficulty sits closest to where the run currently is.
   * Being one tile short is a mild penalty rather than a veto: a three-tile
   * round of 快/块/决 teaches far more than a four-tile round of whatever the
   * scorer scraped together, and the curated sets are the best material in the
   * game, so they get their thumb on the scale too.
   */
  const group = groupsFor(char)
    .filter((g) => g.chars.length >= 2)
    .map((g) => ({
      g,
      cost:
        Math.max(0, want - g.chars.length) * 0.15 +
        Math.abs(g.tight - desired) -
        (g.source === "curated" ? 0.18 : 0),
    }))
    .sort((a, b) => a.cost - b.cost)[0]?.g;
  if (!group) return null;

  let pool = group.chars
    .filter((c) => c !== char)
    .map(describe)
    .filter((option) => isAnswerable(target, option));
  if (pool.length === 0) return null;

  // Generated groups are ranked by similarity to their anchor, so an early
  // round can take the loose end of the list and a late round the tight end.
  const tightEnd = group.source === "generated" && group.anchor === char;
  if (tightEnd && pool.length > want - 1) {
    pool = desired > 0.6 ? pool : [...pool].reverse();
  } else {
    pool = shuffle(pool, rng);
  }

  // A two-member set like 那/哪 is the right *content* for a late round but the
  // wrong *shape* — two tiles is a coin flip. Top up from the character's other
  // groups, tightest first, so the tiles fill without diluting the best pairing.
  if (pool.length < want - 1) {
    const taken = new Set([char, ...pool.map((option) => option.char)]);
    for (const other of groupsFor(char)
      .filter((g) => g !== group)
      .sort((a, b) => b.tight - a.tight)) {
      for (const candidate of other.chars) {
        if (pool.length >= want - 1) break;
        if (taken.has(candidate)) continue;
        taken.add(candidate);
        const option = describe(candidate);
        if (isAnswerable(target, option)) pool.push(option);
      }
    }
  }

  const distractors = pool.slice(0, Math.max(1, want - 1));
  return {
    index,
    target,
    options: shuffle([target, ...distractors], rng),
    // A generated group's stored note compares its anchor with its single
    // closest neighbour, which may not even be on screen; recompute against a
    // character the player can actually see.
    note: discriminator(group, char, distractors[0].char),
    group,
    limitMs: Math.round(roundSeconds(index, rounds) * 1000),
  };
}

/**
 * Turn an ordered list of candidate characters into a run. `candidates` is
 * expected to come from `pickForReview`, so the front of the list is what the
 * learner most needs to see.
 *
 * Two passes, because *which* characters to drill and *when* to drill them are
 * separate questions. The first pass honours the review order and just asks who
 * can play; the second re-orders that cast by how hard their best set is, so a
 * run genuinely escalates instead of dropping 一/七 into round 14.
 */
export function buildRun(
  candidates: string[],
  rng: Rng,
  rounds: number = RUN_ROUNDS,
): ImposterRound[] {
  const cast: { char: string; ceiling: number }[] = [];
  const seen = new Set<string>();
  for (const char of candidates) {
    if (cast.length >= rounds) break;
    if (seen.has(char) || !describe(char).inDataset) continue;
    const usable = groupsFor(char).filter((g) => g.chars.length >= 2);
    if (usable.length === 0) continue;
    seen.add(char);
    cast.push({ char, ceiling: Math.max(...usable.map((g) => g.tight)) });
  }
  cast.sort((a, b) => a.ceiling - b.ceiling);

  const out: ImposterRound[] = [];
  // Two rounds showing the same tiles in a row read as a bug, not a drill.
  const shown = new Set<string>();
  for (const { char } of cast) {
    const round = buildRound(char, out.length, rng, rounds);
    if (!round) continue;
    const signature = [...round.options.map((o) => o.char)].sort().join("");
    if (shown.has(signature)) continue;
    shown.add(signature);
    out.push(round);
  }
  return out;
}

/* ------------------------------------------------------------------ *
 * Scoring
 * ------------------------------------------------------------------ */

export interface ScoreInput {
  msLeft: number;
  limitMs: number;
  options: number;
  /** Consecutive correct answers *before* this one. */
  streak: number;
}

/**
 * Speed is most of the point, so it is most of the score: a clean fast answer on
 * a four-tile round is worth roughly three times a slow two-tile one.
 */
export function roundPoints({ msLeft, limitMs, options, streak }: ScoreInput): number {
  const speed = Math.max(0, Math.min(1, msLeft / limitMs));
  return (
    60 + Math.round(60 * speed) + 20 * (options - 2) + Math.min(50, streak * 10)
  );
}
