"use client";

/**
 * The single source of truth for "how well do I know this character".
 *
 * Everything lives in localStorage — the site is a static export, there is no
 * account and no server. Every game writes through `recordAnswer` /
 * `recordSession`; the home dashboard and the territory map read the same
 * numbers back, so progress in one game shows up everywhere else.
 */

import { useSyncExternalStore } from "react";

import type { HskLevel } from "@/lib/characters";
import { GAME_IDS, type GameId } from "@/lib/games";

export const STORAGE_KEY = "hanzi-garden.progress.v1";

/** Per-character memory record. Keys are short — this is serialized a lot. */
export interface CharStat {
  /** Times the character has been put in front of the learner. */
  seen: number;
  /** Lifetime correct answers. */
  correct: number;
  /** Lifetime wrong answers. */
  wrong: number;
  /** Consecutive correct answers; a wrong answer knocks it down, not to zero. */
  tier: number;
  /** Epoch ms of the last answer of any kind. */
  lastSeen: number;
  /** Epoch ms of the last *correct* answer — decay is measured from here. */
  lastCorrect: number;
}

export interface GameStat {
  plays: number;
  best: number;
  last: number;
  lastPlayed: number;
  totalMs: number;
}

export interface DayStat {
  answers: number;
  correct: number;
  ms: number;
}

export interface ProgressState {
  version: 1;
  createdAt: number;
  chars: Record<string, CharStat>;
  games: Record<GameId, GameStat>;
  /** ISO date (local) -> activity that day. */
  days: Record<string, DayStat>;
  /** Characters discovered in Character Alchemy. */
  discovered: string[];
  /** Alchemy target puzzles solved, by target character. */
  solvedTargets: string[];
}

export const MAX_TIER = 5;

/** Half-life of a memory at each tier, in days. Straight out of SRS practice. */
const HALF_LIFE_DAYS = [0.35, 1, 2.5, 6, 15, 40];

const DAY_MS = 86_400_000;

function emptyGameStat(): GameStat {
  return { plays: 0, best: 0, last: 0, lastPlayed: 0, totalMs: 0 };
}

export function emptyState(): ProgressState {
  return {
    version: 1,
    createdAt: 0,
    chars: {},
    games: Object.fromEntries(GAME_IDS.map((id) => [id, emptyGameStat()])) as Record<
      GameId,
      GameStat
    >,
    days: {},
    discovered: [],
    solvedTargets: [],
  };
}

export function emptyCharStat(): CharStat {
  return { seen: 0, correct: 0, wrong: 0, tier: 0, lastSeen: 0, lastCorrect: 0 };
}

/* ------------------------------------------------------------------ *
 * Memory model — shared by the dashboard, the territory map and review
 * ordering, so "mastered" means the same thing in every corner of the site.
 * ------------------------------------------------------------------ */

/** 1 → perfectly fresh, 0 → completely faded. */
export function retention(stat: CharStat | undefined, now: number): number {
  if (!stat || stat.tier <= 0 || !stat.lastCorrect) return 0;
  const halfLife = HALF_LIFE_DAYS[Math.min(stat.tier, MAX_TIER)] * DAY_MS;
  const elapsed = Math.max(0, now - stat.lastCorrect);
  return Math.pow(2, -elapsed / halfLife);
}

/**
 * 0 → untouched, 1 → solidly known right now. Combines how deep the memory
 * was built (tier) with how much of it is left (retention).
 */
export function mastery(stat: CharStat | undefined, now: number): number {
  if (!stat) return 0;
  const depth = Math.min(stat.tier, MAX_TIER) / MAX_TIER;
  return depth * retention(stat, now);
}

export type CharState = "unseen" | "shaky" | "held" | "fading" | "mastered";

export function charState(stat: CharStat | undefined, now: number): CharState {
  if (!stat || stat.seen === 0) return "unseen";
  if (stat.tier === 0) return "shaky";
  const r = retention(stat, now);
  if (r < 0.4) return "fading";
  if (stat.tier >= 4 && r > 0.75) return "mastered";
  return "held";
}

/** How overdue a character is — higher means "review me next". */
export function reviewUrgency(stat: CharStat | undefined, now: number): number {
  if (!stat || stat.seen === 0) return 0.55; // new material: worth showing, but reviews win
  return 1 - retention(stat, now) + (stat.wrong > stat.correct ? 0.25 : 0);
}

/** Local (not UTC) ISO date — the streak should follow the learner's day. */
export function dayKey(when: number | Date = Date.now()): string {
  const d = when instanceof Date ? when : new Date(when);
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/* ------------------------------------------------------------------ *
 * Store
 * ------------------------------------------------------------------ */

let state: ProgressState | null = null;
const listeners = new Set<() => void>();
const SERVER_SNAPSHOT = emptyState();

function migrate(raw: unknown): ProgressState {
  const base = emptyState();
  if (!raw || typeof raw !== "object") return base;
  const parsed = raw as Partial<ProgressState>;
  return {
    ...base,
    ...parsed,
    version: 1,
    chars: { ...base.chars, ...(parsed.chars ?? {}) },
    games: { ...base.games, ...(parsed.games ?? {}) },
    days: { ...base.days, ...(parsed.days ?? {}) },
    discovered: parsed.discovered ?? [],
    solvedTargets: parsed.solvedTargets ?? [],
  };
}

function read(): ProgressState {
  if (state) return state;
  if (typeof window === "undefined") return SERVER_SNAPSHOT;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    state = raw ? migrate(JSON.parse(raw)) : { ...emptyState(), createdAt: Date.now() };
  } catch {
    state = { ...emptyState(), createdAt: Date.now() };
  }
  return state;
}

function commit(next: ProgressState) {
  state = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Quota or private mode — the session still works, it just won't persist.
    }
  }
  for (const listener of listeners) listener();
}

/** Apply a pure update to the stored state. */
export function update(fn: (draft: ProgressState) => ProgressState): void {
  commit(fn(read()));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1 && typeof window !== "undefined") {
    window.addEventListener("storage", onStorage);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== "undefined") {
      window.removeEventListener("storage", onStorage);
    }
  };
}

function onStorage(event: StorageEvent) {
  if (event.key !== null && event.key !== STORAGE_KEY) return;
  state = null; // another tab wrote; drop the cache and re-read
  for (const listener of listeners) listener();
}

/* ------------------------------------------------------------------ *
 * Writes
 * ------------------------------------------------------------------ */

export interface AnswerInput {
  char: string;
  correct: boolean;
  /** Which game the answer came from, for the activity log. */
  game?: GameId;
  /** Time the learner took, in ms. */
  ms?: number;
  /** A hint or a slow answer can count for less than a clean one. */
  weight?: number;
}

/** Record one answer about one character. This is the main write path. */
export function recordAnswer(input: AnswerInput): void {
  recordAnswers([input]);
}

/** Batch version — a round of 10 answers is one localStorage write, not ten. */
export function recordAnswers(inputs: AnswerInput[]): void {
  if (inputs.length === 0) return;
  const now = Date.now();
  const key = dayKey(now);

  update((prev) => {
    const chars = { ...prev.chars };
    const days = { ...prev.days };
    const today = { ...(days[key] ?? { answers: 0, correct: 0, ms: 0 }) };

    for (const { char, correct, ms = 0, weight = 1 } of inputs) {
      const stat = { ...(chars[char] ?? emptyCharStat()) };
      stat.seen += 1;
      stat.lastSeen = now;
      if (correct) {
        stat.correct += 1;
        stat.lastCorrect = now;
        stat.tier = Math.min(MAX_TIER, stat.tier + (weight >= 1 ? 1 : 0.5));
      } else {
        stat.wrong += 1;
        // A miss costs progress but does not erase months of work.
        stat.tier = Math.max(0, Math.floor(stat.tier) - 1);
      }
      chars[char] = stat;

      today.answers += 1;
      if (correct) today.correct += 1;
      today.ms += ms;
    }

    days[key] = today;
    return { ...prev, chars, days, createdAt: prev.createdAt || now };
  });
}

export interface SessionInput {
  game: GameId;
  /** The game's headline number for the run (points, tiles taken, …). */
  score: number;
  durationMs?: number;
}

/** Record the end of a run: play count, personal best, last-played. */
export function recordSession({ game, score, durationMs = 0 }: SessionInput): void {
  const now = Date.now();
  update((prev) => {
    const stat = prev.games[game] ?? emptyGameStat();
    return {
      ...prev,
      createdAt: prev.createdAt || now,
      games: {
        ...prev.games,
        [game]: {
          plays: stat.plays + 1,
          best: Math.max(stat.best, score),
          last: score,
          lastPlayed: now,
          totalMs: stat.totalMs + durationMs,
        },
      },
    };
  });
}

/** Alchemy: remember a character the learner has fused for the first time. */
export function recordDiscovery(char: string, wasTarget = false): boolean {
  const known = read().discovered.includes(char);
  update((prev) => ({
    ...prev,
    createdAt: prev.createdAt || Date.now(),
    discovered: prev.discovered.includes(char)
      ? prev.discovered
      : [...prev.discovered, char],
    solvedTargets:
      wasTarget && !prev.solvedTargets.includes(char)
        ? [...prev.solvedTargets, char]
        : prev.solvedTargets,
  }));
  return !known;
}

export function resetProgress(): void {
  commit({ ...emptyState(), createdAt: Date.now() });
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */

/** Subscribe a component to the whole progress state. */
export function useProgress(): ProgressState {
  return useSyncExternalStore(subscribe, read, () => SERVER_SNAPSHOT);
}

/* ------------------------------------------------------------------ *
 * Clock
 * ------------------------------------------------------------------ */

const clockListeners = new Set<() => void>();
let clockTimer: ReturnType<typeof setInterval> | null = null;
let clockNow = 0;

function subscribeClock(listener: () => void): () => void {
  clockListeners.add(listener);
  if (!clockTimer) {
    clockNow = Date.now();
    clockTimer = setInterval(() => {
      clockNow = Date.now();
      for (const fn of clockListeners) fn();
    }, 60_000);
  }
  return () => {
    clockListeners.delete(listener);
    if (clockListeners.size === 0 && clockTimer) {
      clearInterval(clockTimer);
      clockTimer = null;
    }
  };
}

/**
 * "Now", as a stable value that ticks once a minute. Memory decay is a function
 * of elapsed time, so anything showing it needs a clock — but reading
 * `Date.now()` during render is impure and would defeat memoization. Returns 0
 * on the server and for the first client paint, which is the hydration cue.
 */
export function useNow(): number {
  return useSyncExternalStore(
    subscribeClock,
    () => clockNow || (clockNow = Date.now()),
    () => 0,
  );
}

/**
 * True once the component has read real localStorage rather than the empty
 * server snapshot. Gate anything that would otherwise flash "0" on hydration.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}

export interface LevelSummary {
  level: HskLevel;
  total: number;
  touched: number;
  held: number;
  mastered: number;
  /** Mean mastery across every character in the level, 0-1. */
  strength: number;
}

export function summarizeLevel(
  progress: ProgressState,
  chars: { char: string; hsk: HskLevel }[],
  level: HskLevel,
  now: number,
): LevelSummary {
  const inLevel = chars.filter((c) => c.hsk === level);
  let touched = 0;
  let held = 0;
  let mastered = 0;
  let sum = 0;
  for (const { char } of inLevel) {
    const stat = progress.chars[char];
    if (stat?.seen) touched += 1;
    const state = charState(stat, now);
    if (state === "held" || state === "mastered") held += 1;
    if (state === "mastered") mastered += 1;
    sum += mastery(stat, now);
  }
  return {
    level,
    total: inLevel.length,
    touched,
    held,
    mastered,
    strength: inLevel.length ? sum / inLevel.length : 0,
  };
}

/** Consecutive days ending today (or yesterday) with at least one answer. */
export function currentStreak(progress: ProgressState, now = Date.now()): number {
  let streak = 0;
  const cursor = new Date(now);
  // Yesterday still counts — the streak only breaks after a full day is missed.
  if (!progress.days[dayKey(cursor)]?.answers) {
    cursor.setDate(cursor.getDate() - 1);
    if (!progress.days[dayKey(cursor)]?.answers) return 0;
  }
  while (progress.days[dayKey(cursor)]?.answers) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** The last `days` days, oldest first — for the activity heatmap. */
export function activityWindow(
  progress: ProgressState,
  days: number,
  now = Date.now(),
): { key: string; date: Date; stat: DayStat }[] {
  const out: { key: string; date: Date; stat: DayStat }[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(now);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - i);
    const key = dayKey(date);
    out.push({ key, date, stat: progress.days[key] ?? { answers: 0, correct: 0, ms: 0 } });
  }
  return out;
}

export interface Totals {
  answers: number;
  correct: number;
  accuracy: number;
  charsTouched: number;
  charsHeld: number;
  charsMastered: number;
  minutes: number;
}

export function totals(progress: ProgressState, now = Date.now()): Totals {
  let answers = 0;
  let correct = 0;
  let ms = 0;
  for (const day of Object.values(progress.days)) {
    answers += day.answers;
    correct += day.correct;
    ms += day.ms;
  }
  let touched = 0;
  let held = 0;
  let mastered = 0;
  for (const stat of Object.values(progress.chars)) {
    if (stat.seen) touched += 1;
    const state = charState(stat, now);
    if (state === "held" || state === "mastered") held += 1;
    if (state === "mastered") mastered += 1;
  }
  return {
    answers,
    correct,
    accuracy: answers ? correct / answers : 0,
    charsTouched: touched,
    charsHeld: held,
    charsMastered: mastered,
    minutes: Math.round(ms / 60_000),
  };
}

/**
 * Pick characters to drill, review-first: overdue material comes before new
 * material, with a little noise so consecutive rounds are not identical.
 */
export function pickForReview<T extends { char: string }>(
  progress: ProgressState,
  pool: T[],
  count: number,
  now = Date.now(),
): T[] {
  return [...pool]
    .map((item) => ({
      item,
      score: reviewUrgency(progress.chars[item.char], now) + Math.random() * 0.3,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, count)
    .map((entry) => entry.item);
}
