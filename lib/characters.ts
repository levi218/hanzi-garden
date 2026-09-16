import charactersData from "@/data/characters.json";
import type { CharacterEntry } from "@/lib/types";

export const characters = charactersData as CharacterEntry[];

export const HSK_LEVELS = [1, 2, 3] as const;
export type HskLevel = (typeof HSK_LEVELS)[number];

/** Slug for a character: "u" + lowercase hex codepoint (e.g. hao -> "u597d"). */
export function slugFor(char: string): string {
  const cp = char.codePointAt(0) ?? 0;
  return `u${cp.toString(16).padStart(4, "0")}`;
}

const COMBINING_MARKS = /[̀-ͯ]/g;
// After NFD, an u-umlaut is "u" + U+0308, optionally followed by a tone mark.
const UMLAUT_U = /ü/g;

/** Strip tone marks so typing "hao" matches the tone-marked pinyin. */
export function plainText(value: string): string {
  return value
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .trim();
}

/** Like plainText, but spells u-umlaut as "v" (how it is typed on a keyboard). */
export function vSpelling(value: string): string {
  return value
    .normalize("NFD")
    .replace(UMLAUT_U, "v")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .trim();
}

export const totalCount = characters.length;

export const countsByLevel: Record<HskLevel, number> = HSK_LEVELS.reduce(
  (acc, level) => {
    acc[level] = characters.filter((c) => c.hsk === level).length;
    return acc;
  },
  { 1: 0, 2: 0, 3: 0 } as Record<HskLevel, number>,
);

export function byLevel(level: HskLevel): CharacterEntry[] {
  return characters.filter((c) => c.hsk === level);
}

export function findBySlug(slug: string): CharacterEntry | undefined {
  return characters.find((c) => slugFor(c.char) === slug);
}

export interface LevelNeighbors {
  prev?: CharacterEntry;
  next?: CharacterEntry;
  /** 1-based position within the HSK level, in data order. */
  position: number;
  levelSize: number;
}

/** Previous / next character within the same HSK level, in data order. */
export function neighborsFor(entry: CharacterEntry): LevelNeighbors {
  const siblings = byLevel(entry.hsk);
  const index = siblings.findIndex((c) => c.char === entry.char);
  return {
    prev: index > 0 ? siblings[index - 1] : undefined,
    next:
      index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : undefined,
    position: index + 1,
    levelSize: siblings.length,
  };
}

/** Lightweight shape handed to the client for browsing / searching. */
export interface CharacterCardData {
  slug: string;
  char: string;
  pinyin: string;
  hsk: HskLevel;
  def: string;
  /** Pre-normalized haystack: the character, toneless pinyin and English definitions. */
  haystack: string;
}

export function buildCardData(): CharacterCardData[] {
  return characters.map((c) => {
    const toneless = plainText(c.pinyin);
    return {
      slug: slugFor(c.char),
      char: c.char,
      pinyin: c.pinyin,
      hsk: c.hsk,
      def: c.meanings[0]?.def ?? "",
      haystack: [
        c.char,
        c.pinyin.toLowerCase(),
        toneless,
        toneless.replace(/\s+/g, ""),
        vSpelling(c.pinyin),
        ...c.meanings.map((m) => m.def.toLowerCase()),
      ].join(" "),
    };
  });
}

export interface LevelStyle {
  label: string;
  short: string;
  badge: string;
  dot: string;
  border: string;
  glow: string;
  accent: string;
}

/** A distinct colour identity per HSK level (full class strings, so Tailwind keeps them). */
export const LEVEL_STYLES: Record<HskLevel, LevelStyle> = {
  1: {
    label: "HSK 1",
    short: "1",
    badge:
      "bg-emerald-500/12 text-emerald-700 ring-emerald-600/25 dark:text-emerald-300 dark:ring-emerald-400/25",
    dot: "bg-emerald-500",
    border: "hover:border-emerald-500/50",
    glow: "from-emerald-400/25",
    accent: "text-emerald-700 dark:text-emerald-300",
  },
  2: {
    label: "HSK 2",
    short: "2",
    badge:
      "bg-amber-500/14 text-amber-800 ring-amber-600/25 dark:text-amber-300 dark:ring-amber-400/25",
    dot: "bg-amber-500",
    border: "hover:border-amber-500/50",
    glow: "from-amber-400/25",
    accent: "text-amber-800 dark:text-amber-300",
  },
  3: {
    label: "HSK 3",
    short: "3",
    badge:
      "bg-rose-500/12 text-rose-700 ring-rose-600/25 dark:text-rose-300 dark:ring-rose-400/25",
    dot: "bg-rose-500",
    border: "hover:border-rose-500/50",
    glow: "from-rose-400/25",
    accent: "text-rose-700 dark:text-rose-300",
  },
};
