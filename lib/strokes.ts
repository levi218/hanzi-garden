/**
 * Stroke geometry and scoring for Stroke Rhythm.
 *
 * Pure module — no React, no component state. Everything here is either
 * "fetch and normalise a character's stroke file" or "given a path the player
 * drew, how good was it". The game component owns the clock and the UI.
 */

import { slugFor } from "@/lib/characters";
import { basePath } from "@/lib/site";

export interface Pt {
  x: number;
  y: number;
}

/* ------------------------------------------------------------------ *
 * Coordinate space
 * ------------------------------------------------------------------ */

/** Make Me a Hanzi draws into a 1024-wide box. */
export const BOX = 1024;

/**
 * ...but with the y axis pointing *up* from a baseline at y = 900, so raw
 * medians run from about y = -76 (descender) to y = 867 (ascender). SVG's y
 * points down, hence the flip. The path `d` strings can only be un-flipped by
 * a transform on the group that renders them; medians are plain numbers, so we
 * flip those once at load time and never think about it again.
 */
export const HANZI_BASELINE = 900;

/** Put this on the <g> that holds the raw `strokes[i]` path data. */
export const HANZI_TRANSFORM = `scale(1, -1) translate(0, -${HANZI_BASELINE})`;

/** Raw median point -> canvas point (y down, origin top-left, 0..1024). */
export function toCanvas(point: readonly [number, number]): Pt {
  return { x: point[0], y: HANZI_BASELINE - point[1] };
}

/* ------------------------------------------------------------------ *
 * Loading
 * ------------------------------------------------------------------ */

/** Shape of `public/strokes/u*.json`, as written by scripts/build-stroke-data.mjs. */
interface RawStrokeFile {
  char: string;
  strokes: string[];
  medians: [number, number][][];
}

export interface StrokeCharacter {
  char: string;
  /** SVG path `d` per stroke, in stroke order. Needs `HANZI_TRANSFORM`. */
  strokes: string[];
  /** Centre-line per stroke, already flipped into canvas space. */
  medians: Pt[][];
  /** Chord length of each median (see `chordLength`), in canvas units. */
  lengths: number[];
}

const cache = new Map<string, StrokeCharacter | null>();
const inFlight = new Map<string, Promise<StrokeCharacter | null>>();

function normalise(raw: RawStrokeFile): StrokeCharacter {
  const medians = raw.medians.map((median) => median.map(toCanvas));
  return {
    char: raw.char,
    strokes: raw.strokes,
    medians,
    lengths: medians.map(chordLength),
  };
}

/** Already-loaded data, if any. Lets a render read without suspending. */
export function cachedStrokes(char: string): StrokeCharacter | null | undefined {
  return cache.get(char);
}

/**
 * Fetch a character's stroke file. Resolves to `null` on any failure so a run
 * can skip a bad character instead of dying; the null is cached so we do not
 * retry a 404 on every round.
 */
export function loadStrokes(char: string): Promise<StrokeCharacter | null> {
  const hit = cache.get(char);
  if (hit !== undefined) return Promise.resolve(hit);

  const pending = inFlight.get(char);
  if (pending) return pending;

  // `basePath` because this is a hand-built URL: Next rewrites <Link> hrefs
  // and bundled assets under a sub-path deploy, but not a bare `fetch`.
  const request = fetch(`${basePath}/strokes/${slugFor(char)}.json`)
    .then((response) => {
      if (!response.ok) throw new Error(`stroke data ${response.status}`);
      return response.json() as Promise<RawStrokeFile>;
    })
    .then((raw) => {
      const data =
        raw && Array.isArray(raw.strokes) && raw.strokes.length > 0
          ? normalise(raw)
          : null;
      cache.set(char, data);
      return data;
    })
    .catch(() => {
      cache.set(char, null);
      return null;
    })
    .finally(() => {
      inFlight.delete(char);
    });

  inFlight.set(char, request);
  return request;
}

/** Warm the cache for a character we are about to need. Fire and forget. */
export function prefetchStrokes(char: string | undefined): void {
  if (char) void loadStrokes(char);
}

/* ------------------------------------------------------------------ *
 * Polyline maths
 * ------------------------------------------------------------------ */

export function distance(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function polylineLength(points: Pt[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += distance(points[i - 1], points[i]);
  return total;
}

/** Drop points that repeat the previous one — they break the arc-length walk. */
function dedupe(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || distance(last, p) > 0.001) out.push(p);
  }
  return out;
}

/**
 * Re-space a polyline to `count` points that are evenly spread along its arc
 * length. This is what makes the comparison fair: a player who dawdles at the
 * start and rushes at the end draws the same *shape*, and resampling by
 * distance (not by time or by raw sample index) throws that difference away.
 */
export function resample(points: Pt[], count: number): Pt[] {
  const clean = dedupe(points);
  if (clean.length === 0) return [];
  if (clean.length === 1) return new Array<Pt>(count).fill(clean[0]);

  const total = polylineLength(clean);
  const step = total / (count - 1);
  const out: Pt[] = [clean[0]];

  let seg = 1; // we are walking along clean[seg - 1] -> clean[seg]
  let consumed = 0; // distance already used up inside that segment

  for (let k = 1; k < count - 1; k += 1) {
    let need = step;
    while (need > 0 && seg < clean.length) {
      const remain = distance(clean[seg - 1], clean[seg]) - consumed;
      if (remain > need) {
        consumed += need;
        need = 0;
      } else {
        need -= remain;
        consumed = 0;
        seg += 1;
      }
    }
    if (seg >= clean.length) {
      out.push(clean[clean.length - 1]);
    } else {
      const a = clean[seg - 1];
      const b = clean[seg];
      const t = consumed / (distance(a, b) || 1);
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
  }

  out.push(clean[clean.length - 1]);
  return out;
}

function meanPairDistance(a: Pt[], b: Pt[], reverse = false): number {
  const n = Math.min(a.length, b.length);
  if (n === 0) return Infinity;
  let sum = 0;
  for (let i = 0; i < n; i += 1) sum += distance(a[i], b[reverse ? n - 1 - i : i]);
  return sum / n;
}

function pointToSegment(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function pointToPolyline(p: Pt, poly: Pt[]): number {
  if (poly.length === 0) return Infinity;
  if (poly.length === 1) return distance(p, poly[0]);
  let best = Infinity;
  for (let i = 1; i < poly.length; i += 1) {
    best = Math.min(best, pointToSegment(p, poly[i - 1], poly[i]));
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Trace scoring
 *
 * All distances below are in canvas units (the 1024 box), so "60" is roughly
 * 6% of the character's width — about the width of a fat brush stroke.
 * ------------------------------------------------------------------ */

/** How many points both paths get squashed to before comparing. */
const SAMPLES = 24;

/** Mean deviation at or below this is a flawless trace. */
const GREAT_DISTANCE = 30;

/** Mean deviation above this is not the same stroke. The shape *gate*. */
const PASS_DISTANCE = 105;

/** A drawn path shorter than this is a tap, not a drag. */
const TAP_DRAW_LENGTH = 45;

/**
 * Only strokes this short may be satisfied by a tap. Real 丶 dots in this
 * dataset measure 120-180 units (六 is 166, 方 is 180), so the threshold sits
 * just above them; pushing it higher starts letting a tap claim short-but-real
 * strokes that sit near each other.
 */
const TAP_TARGET_LENGTH = 190;

/** How near a tap has to land to the dot it is claiming. */
const TAP_RADIUS = 85;

/** A trace covering less of the stroke than this did not finish it. */
const MIN_LENGTH_RATIO = 0.6;

/** ...and one this much longer overshot into somewhere else entirely. */
const MAX_LENGTH_RATIO = 2.0;

/**
 * How far the trace's first/last point may sit from the median's, as a share
 * of the stroke's own length. Proportional rather than flat: a fingertip is a
 * fixed number of pixels wide (hence the floor), but on a long stroke a flat
 * tolerance would wave through a trace that skipped the first third of it.
 */
function endpointTolerance(medianLength: number): number {
  return Math.max(95, Math.min(150, 0.35 * medianLength));
}

/**
 * Below this end-to-end separation a median is too curled for the direction
 * test to mean anything (a tiny hook reads almost the same either way), so we
 * skip the reversal check rather than fail an honest trace.
 */
const DIRECTIONAL_SEPARATION = 70;

/**
 * Length measured along the chords of the arc-length-resampled polyline rather
 * than the raw one. A finger on glass produces high-frequency jitter that can
 * inflate a raw arc length by 50% or more without changing the shape at all;
 * 24 chords cut straight across that wobble. Medians are measured the same way
 * so the two are comparable.
 */
export function chordLength(points: Pt[]): number {
  if (points.length < 2) return 0;
  return polylineLength(resample(points, SAMPLES));
}

export type TraceReason =
  | "ok"
  | "empty"
  | "reversed"
  | "wrong-start"
  | "unfinished"
  | "off-target";

export interface TraceResult {
  /** Did the trace clear the shape gate? */
  ok: boolean;
  /** 0..1 — 1 is dead on the median, 0 is right at the gate. */
  quality: number;
  /** Mean deviation from the median, in canvas units. */
  deviation: number;
  reason: TraceReason;
  kind: "drag" | "tap";
}

function fail(reason: TraceReason, deviation: number, kind: "drag" | "tap"): TraceResult {
  return { ok: false, quality: 0, deviation, reason, kind };
}

function qualityFor(deviation: number): number {
  const span = PASS_DISTANCE - GREAT_DISTANCE;
  return Math.max(0, Math.min(1, 1 - (deviation - GREAT_DISTANCE) / span));
}

/**
 * Compare a drawn path against one stroke's median.
 *
 * Deliberately forgiving on precision and unforgiving on identity: we want
 * "yes, that was stroke 3, drawn the right way round", not calligraphy marking.
 * The gates run cheapest-and-most-diagnostic first so the caller can say
 * something useful ("start at the dot") instead of a flat "no".
 */
export function scoreTrace(drawn: Pt[], median: Pt[], medianLength: number): TraceResult {
  const clean = dedupe(drawn);
  if (clean.length === 0 || median.length < 2) return fail("empty", Infinity, "drag");

  const a = clean.length === 1 ? clean : resample(clean, SAMPLES);
  const drawnLength = polylineLength(a);

  // Dots have an almost-zero-length median; you cannot trace one, you poke it.
  if (drawnLength < TAP_DRAW_LENGTH) {
    if (medianLength > TAP_TARGET_LENGTH) return fail("unfinished", Infinity, "tap");
    const deviation = pointToPolyline(a[0], median);
    if (deviation > TAP_RADIUS) return fail("off-target", deviation, "tap");
    // Put the tap's deviation on the same 0..1 quality curve as a drag.
    return {
      ok: true,
      quality: Math.max(0, Math.min(1, 1 - deviation / TAP_RADIUS)),
      deviation,
      reason: "ok",
      kind: "tap",
    };
  }

  const b = resample(median, SAMPLES);
  const forward = meanPairDistance(a, b);
  const backward = meanPairDistance(a, b, true);

  // Both paths are resampled by arc length, so a backwards trace lines up with
  // the reversed median and nothing else. Steadier than comparing start-to-end
  // vectors, which a hooked stroke (乙, 弓) fools easily.
  const separation = distance(median[0], median[median.length - 1]);
  if (separation >= DIRECTIONAL_SEPARATION && backward < forward) {
    return fail("reversed", forward, "drag");
  }

  // Endpoints are checked explicitly because the mean is too kind to a trace
  // that only covers half a long stroke: half of 24 pairs still line up.
  const tolerance = endpointTolerance(medianLength);
  if (distance(a[0], b[0]) > tolerance) return fail("wrong-start", forward, "drag");
  if (distance(a[a.length - 1], b[b.length - 1]) > tolerance) {
    return fail("unfinished", forward, "drag");
  }

  const ratio = drawnLength / Math.max(1, medianLength);
  if (ratio < MIN_LENGTH_RATIO) return fail("unfinished", forward, "drag");
  if (ratio > MAX_LENGTH_RATIO) return fail("off-target", forward, "drag");

  if (forward > PASS_DISTANCE) return fail("off-target", forward, "drag");

  return { ok: true, quality: qualityFor(forward), deviation: forward, reason: "ok", kind: "drag" };
}

export interface StrokeMatch {
  index: number;
  result: TraceResult;
}

/**
 * Which of `candidates` does this path look most like? Used after the due
 * stroke rejects a trace, to tell "you drew the right shape at the wrong time"
 * apart from "you drew a squiggle".
 */
export function identifyStroke(
  drawn: Pt[],
  data: StrokeCharacter,
  candidates: number[],
): StrokeMatch | null {
  let best: StrokeMatch | null = null;
  for (const index of candidates) {
    const result = scoreTrace(drawn, data.medians[index], data.lengths[index]);
    if (!result.ok) continue;
    if (!best || result.deviation < best.result.deviation) best = { index, result };
  }
  return best;
}

/* ------------------------------------------------------------------ *
 * Rhythm
 * ------------------------------------------------------------------ */

export interface Tempo {
  id: string;
  label: string;
  bpm: number;
}

/**
 * Tempo is the difficulty knob: same rules, less time. "Practice" has no clock
 * at all, so the beat maths below simply never runs.
 */
export const TEMPOS: Tempo[] = [
  { id: "practice", label: "Practice", bpm: 0 },
  { id: "slow", label: "Slow 60", bpm: 60 },
  { id: "steady", label: "Steady 84", bpm: 84 },
  { id: "fast", label: "Fast 110", bpm: 110 },
];

export function beatMs(bpm: number): number {
  return bpm > 0 ? 60_000 / bpm : 0;
}

export type Judgement = "perfect" | "good" | "late" | "miss";

/**
 * Windows are a fraction of the beat so a slow tempo really is easier, with an
 * absolute floor because tracing a stroke has a physical cost that does not
 * shrink when the metronome speeds up.
 */
export function perfectWindow(beat: number): number {
  return Math.max(0.35 * beat, 200);
}
export function goodWindow(beat: number): number {
  return Math.max(0.75 * beat, 400);
}
/** Past this, the stroke is auto-inked in grey and counted as missed. */
export function missWindow(beat: number): number {
  return Math.max(1.4 * beat, 800);
}

/** `delta` is (trace start) - (beat), so negative means early. */
export function judgeTiming(delta: number, beat: number): Judgement {
  const off = Math.abs(delta);
  if (off <= perfectWindow(beat)) return "perfect";
  if (off <= goodWindow(beat)) return "good";
  if (off <= missWindow(beat)) return "late";
  return "miss";
}

const JUDGEMENT_POINTS: Record<Judgement, number> = {
  perfect: 100,
  good: 60,
  late: 30,
  miss: 0,
};

/** Every fourth consecutive clean stroke buys another multiplier, capped at 4x. */
export function comboMultiplier(combo: number): number {
  return Math.min(4, 1 + Math.floor(combo / 4));
}

/**
 * Shape is a gate, not the score — a barely-legal trace still banks 60% of the
 * note. Timing and order are what the multipliers key off.
 */
export function notePoints(judgement: Judgement, quality: number, combo: number): number {
  const base = JUDGEMENT_POINTS[judgement];
  if (base === 0) return 0;
  return Math.round(base * (0.6 + 0.4 * quality) * comboMultiplier(combo));
}

/**
 * The metronome does not wait, but it does not run away either: once the
 * player is behind, the next beat slides to sit a fixed gap after the stroke
 * they just finished. Without this, one slow stroke near the start dooms every
 * stroke after it, which teaches nothing.
 */
export const CATCH_UP_GAP = 0.6;

export function rescheduleAfter(
  beats: number[],
  resolvedIndex: number,
  resolvedAt: number,
  beat: number,
): number[] {
  const next = resolvedIndex + 1;
  if (next >= beats.length) return beats;
  const earliest = resolvedAt + CATCH_UP_GAP * beat;
  const shift = earliest - beats[next];
  if (shift <= 0) return beats;
  return beats.map((at, i) => (i > resolvedIndex ? at + shift : at));
}

/* ------------------------------------------------------------------ *
 * Per-character result
 * ------------------------------------------------------------------ */

export interface CharResult {
  char: string;
  strokes: number;
  /** Strokes resolved by a correct, in-order trace. */
  hits: number;
  /** Traces that matched some *other* stroke — the mistake this game exists for. */
  orderErrors: number;
  perfect: number;
  score: number;
  ms: number;
}

/** Fraction of the character's strokes the player actually landed, in order. */
export function accuracyOf(result: CharResult): number {
  return result.strokes > 0 ? result.hits / result.strokes : 0;
}

/**
 * What the shared progress store gets told about this character. Order is the
 * hard requirement; a clean run with one late stroke still counts, at half
 * weight, because the learner did know the sequence.
 */
export function gradeCharacter(result: CharResult): { correct: boolean; weight: number } {
  const accuracy = accuracyOf(result);
  const correct = result.orderErrors === 0 && accuracy >= 0.8;
  const flawless = result.orderErrors === 0 && accuracy === 1;
  return { correct, weight: flawless ? 1 : 0.5 };
}

/* ------------------------------------------------------------------ *
 * Per-stroke play state
 *
 * Lives here rather than in a component so the canvas, the beat lane and the
 * game itself all agree on what a note is.
 * ------------------------------------------------------------------ */

export type NoteStatus = "pending" | "hit" | "missed";

export interface Note {
  status: NoteStatus;
  judgement: Judgement | null;
  /** Shape quality of the trace that landed it, 0..1. */
  quality: number;
}

export function pendingNotes(strokeCount: number): Note[] {
  return Array.from({ length: strokeCount }, () => ({
    status: "pending" as NoteStatus,
    judgement: null,
    quality: 0,
  }));
}

export function firstPending(notes: Note[]): number {
  return notes.findIndex((note) => note.status === "pending");
}
