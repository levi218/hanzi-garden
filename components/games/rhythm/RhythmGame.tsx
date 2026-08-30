"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  ActionButton,
  GameShell,
  PillGroup,
  StatChip,
} from "@/components/games/GameShell";
import { BeatLane } from "@/components/games/rhythm/BeatLane";
import { Results } from "@/components/games/rhythm/Results";
import { StrokeCanvas } from "@/components/games/rhythm/StrokeCanvas";
import strokeCounts from "@/data/stroke-counts.json";
import { characters, type HskLevel } from "@/lib/characters";
import { PLAYABLE_LEVELS } from "@/lib/games";
import {
  pickForReview,
  recordAnswer,
  recordSession,
  useHydrated,
  useProgress,
} from "@/lib/progress";
import {
  TEMPOS,
  beatMs,
  comboMultiplier,
  firstPending,
  gradeCharacter,
  identifyStroke,
  judgeTiming,
  loadStrokes,
  missWindow,
  notePoints,
  pendingNotes,
  prefetchStrokes,
  rescheduleAfter,
  scoreTrace,
  type CharResult,
  type Judgement,
  type Note,
  type Pt,
  type StrokeCharacter,
  type TraceReason,
} from "@/lib/strokes";
import type { CharacterEntry } from "@/lib/types";

/** Characters per run. Six averages a little under a minute at Steady. */
const ROUND_SIZE = 6;

/** Empty beats before the first stroke, so the lane has something to show. */
const LEAD_IN_BEATS = 2.5;

/** How long the finished character stays on screen before the next one. */
const REVIEW_MS = 1100;

/** How long a judgement stays in the banner. */
const FLASH_MS = 1400;

/**
 * A stroke being drawn holds off the auto-miss, but only for so long —
 * otherwise resting a finger on the board would pause the clock indefinitely.
 */
const MAX_TRACE_MS = 2500;

/**
 * The dataset's own stroke counts agree with the drawn data for all 565
 * characters, but this is the count we actually draw, so filter on it.
 */
const STROKE_COUNTS = strokeCounts as Record<string, number>;

type Band = "all" | "short" | "mid" | "long";

const BANDS: { value: Band; label: string }[] = [
  { value: "all", label: "Any" },
  { value: "short", label: "1–6" },
  { value: "mid", label: "7–10" },
  { value: "long", label: "11+" },
];

function inBand(char: string, band: Band): boolean {
  const count = STROKE_COUNTS[char] ?? 0;
  if (count === 0) return false; // nothing to draw — keep it out of the pool
  if (band === "short") return count <= 6;
  if (band === "mid") return count >= 7 && count <= 10;
  if (band === "long") return count >= 11;
  return true;
}

/* ------------------------------------------------------------------ *
 * Reduced motion
 * ------------------------------------------------------------------ */

const MOTION_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeMotion(onChange: () => void): () => void {
  const query = window.matchMedia(MOTION_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function readMotion(): boolean {
  return window.matchMedia(MOTION_QUERY).matches;
}

function motionServerSnapshot(): boolean {
  return false;
}

function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribeMotion, readMotion, motionServerSnapshot);
}

/* ------------------------------------------------------------------ *
 * Sound — a metronome click and two judgement blips, synthesised so the
 * static export does not have to ship audio files.
 * ------------------------------------------------------------------ */

type Blip = "beat" | "hit" | "perfect" | "slip";

const BLIPS: Record<Blip, { freq: number; gain: number; ms: number; type: OscillatorType }> = {
  beat: { freq: 480, gain: 0.04, ms: 40, type: "square" },
  hit: { freq: 720, gain: 0.07, ms: 90, type: "triangle" },
  perfect: { freq: 1120, gain: 0.08, ms: 110, type: "triangle" },
  slip: { freq: 150, gain: 0.07, ms: 170, type: "sawtooth" },
};

function playBlip(ctx: AudioContext, kind: Blip): void {
  const spec = BLIPS[kind];
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  const at = ctx.currentTime;
  osc.type = spec.type;
  osc.frequency.setValueAtTime(spec.freq, at);
  gain.gain.setValueAtTime(spec.gain, at);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + spec.ms / 1000);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start(at);
  osc.stop(at + spec.ms / 1000 + 0.02);
}

/* ------------------------------------------------------------------ *
 * Game state
 * ------------------------------------------------------------------ */

interface Board {
  /** Which slot of the queue this board belongs to — guards a stale load. */
  slot: number;
  char: string;
  data: StrokeCharacter;
  notes: Note[];
  /** `performance.now()` each stroke is due. Empty in practice mode. */
  beats: number[];
  startedAt: number;
  hits: number;
  perfect: number;
  orderErrors: number;
  points: number;
  /** Set once every stroke is resolved; drives the between-characters pause. */
  finishedAt: number | null;
}

interface Run {
  queue: CharacterEntry[];
  tempoId: string;
  startedAt: number;
}

interface Flash {
  key: number;
  tone: "good" | "warn" | "bad";
  text: string;
}

type Phase = "setup" | "playing" | "results";

const JUDGEMENT_LABEL: Record<Judgement, string> = {
  perfect: "Perfect",
  good: "Good",
  late: "Late",
  miss: "Too late",
};

function reasonText(reason: TraceReason, due: number): string {
  switch (reason) {
    case "reversed":
      return "Right line, wrong way — follow the arrow.";
    case "wrong-start":
      return "Start on the gold dot.";
    case "unfinished":
      return "Trace the whole stroke.";
    default:
      return `Not stroke ${due + 1} — follow the dashes.`;
  }
}

export function RhythmGame() {
  const progress = useProgress();
  const hydrated = useHydrated();
  const reduced = useReducedMotion();

  const [level, setLevel] = useState<HskLevel | "all">("all");
  const [band, setBand] = useState<Band>("short");
  const [tempoId, setTempoId] = useState<string>("practice");
  const [guides, setGuides] = useState(true);
  const [sound, setSound] = useState(false);

  const [phase, setPhase] = useState<Phase>("setup");
  const [run, setRun] = useState<Run | null>(null);
  const [charIndex, setCharIndex] = useState(0);
  const [board, setBoard] = useState<Board | null>(null);
  const [score, setScore] = useState(0);
  const [combo, setCombo] = useState(0);
  const [maxCombo, setMaxCombo] = useState(0);
  const [results, setResults] = useState<CharResult[]>([]);
  const [flash, setFlash] = useState<Flash | null>(null);

  const audioRef = useRef<AudioContext | null>(null);
  /** When the current trace started, or null — the auto-miss waits mid-trace. */
  const drawingSinceRef = useRef<number | null>(null);
  /**
   * `slot:index` of every stroke already resolved. React state lands a frame
   * later than the event that changed it, so without this a pointerup and the
   * very next animation frame can both resolve the same stroke.
   */
  const resolvedRef = useRef(new Set<string>());
  /** Next beat the metronome has yet to click. */
  const clickRef = useRef(0);
  const flashSeqRef = useRef(0);

  const activeTempo = TEMPOS.find((t) => t.id === (run?.tempoId ?? tempoId)) ?? TEMPOS[0];
  const beat = beatMs(activeTempo.bpm);
  const practice = beat === 0;

  const entry = run?.queue[charIndex];
  const ready = board !== null && board.slot === charIndex && board.char === entry?.char;
  const dueIndex = ready ? firstPending(board.notes) : -1;
  const best = hydrated ? progress.games.rhythm.best : null;

  const pool = characters.filter(
    (item) => (level === "all" || item.hsk === level) && inBand(item.char, band),
  );

  /* ---------------- audio ---------------- */

  function ensureAudio(): AudioContext | null {
    if (audioRef.current) return audioRef.current;
    if (typeof window === "undefined" || typeof window.AudioContext !== "function") return null;
    audioRef.current = new window.AudioContext();
    return audioRef.current;
  }

  function blip(kind: Blip): void {
    if (!sound) return;
    const ctx = audioRef.current;
    if (!ctx) return;
    if (ctx.state === "suspended") void ctx.resume();
    playBlip(ctx, kind);
  }

  function say(tone: Flash["tone"], text: string): void {
    flashSeqRef.current += 1;
    setFlash({ key: flashSeqRef.current, tone, text });
  }

  /** Take ownership of a stroke, or report that something already has. */
  function claim(slot: number, index: number): boolean {
    const key = `${slot}:${index}`;
    if (resolvedRef.current.has(key)) return false;
    resolvedRef.current.add(key);
    return true;
  }

  /* ---------------- run lifecycle ---------------- */

  function startRun(): void {
    if (pool.length === 0) return;
    // pickForReview uses Math.random, so it has to stay out of render — this
    // only ever runs from a click.
    const queue = pickForReview(progress, pool, Math.min(ROUND_SIZE, pool.length));
    if (sound) ensureAudio();
    setRun({ queue, tempoId, startedAt: performance.now() });
    setCharIndex(0);
    setBoard(null);
    setScore(0);
    setCombo(0);
    setMaxCombo(0);
    setResults([]);
    setFlash(null);
    setPhase("playing");
    prefetchStrokes(queue[0]?.char);
  }

  function finishRun(): void {
    // Practice has no clock, so its points are not comparable — recording them
    // would quietly poison the personal best every other game shows.
    if (!practice && run) {
      recordSession({
        game: "rhythm",
        score,
        durationMs: Math.round(performance.now() - run.startedAt),
      });
    }
    setPhase("results");
  }

  function afterCharacter(): void {
    if (!run || charIndex + 1 >= run.queue.length) finishRun();
    else setCharIndex(charIndex + 1);
  }

  const afterCharacterRef = useRef(afterCharacter);
  useEffect(() => {
    afterCharacterRef.current = afterCharacter;
  });

  /* ---------------- loading ---------------- */

  useEffect(() => {
    if (phase !== "playing" || !run) return;
    const next = run.queue[charIndex];
    if (!next) return;
    let cancelled = false;

    loadStrokes(next.char).then((data) => {
      if (cancelled) return;
      if (!data) {
        // A missing stroke file must not end the run — just move on.
        afterCharacterRef.current();
        return;
      }
      const now = performance.now();
      const firstBeat = now + LEAD_IN_BEATS * beat;
      clickRef.current = 0;
      resolvedRef.current.clear();
      drawingSinceRef.current = null;
      setBoard({
        slot: charIndex,
        char: next.char,
        data,
        notes: pendingNotes(data.strokes.length),
        beats: beat > 0 ? data.strokes.map((_, i) => firstBeat + i * beat) : [],
        startedAt: now,
        hits: 0,
        perfect: 0,
        orderErrors: 0,
        points: 0,
        finishedAt: null,
      });
    });

    // Fetch the next character while this one is being played, so the gap
    // between characters is a pause we chose rather than a stall.
    prefetchStrokes(run.queue[charIndex + 1]?.char);

    return () => {
      cancelled = true;
    };
  }, [phase, run, charIndex, beat]);

  /* ---------------- resolution ---------------- */

  function completeCharacter(
    current: Board,
    notes: Note[],
    totals: { hits: number; perfect: number; points: number },
    at: number,
  ): void {
    const result: CharResult = {
      char: current.char,
      strokes: notes.length,
      hits: totals.hits,
      orderErrors: current.orderErrors,
      perfect: totals.perfect,
      score: totals.points,
      ms: Math.round(at - current.startedAt),
    };
    const grade = gradeCharacter(result);
    recordAnswer({
      char: current.char,
      correct: grade.correct,
      game: "rhythm",
      ms: result.ms,
      weight: grade.weight,
    });
    setResults((prev) => [...prev, result]);
  }

  function landStroke(
    current: Board,
    index: number,
    quality: number,
    startedAt: number,
    endedAt: number,
  ): void {
    if (!claim(current.slot, index)) return;
    const judgement: Judgement = practice
      ? "good"
      : judgeTiming(startedAt - current.beats[index], beat);
    const gained = notePoints(judgement, quality, combo);

    const notes = current.notes.map<Note>((note, i) =>
      i === index ? { status: "hit", judgement, quality } : note,
    );
    const totals = {
      hits: current.hits + 1,
      perfect: current.perfect + (judgement === "perfect" ? 1 : 0),
      points: current.points + gained,
    };
    const done = firstPending(notes) < 0;

    setBoard({
      ...current,
      notes,
      beats: practice ? current.beats : rescheduleAfter(current.beats, index, endedAt, beat),
      ...totals,
      finishedAt: done ? endedAt : null,
    });

    if (judgement === "miss") {
      setCombo(0);
    } else {
      const nextCombo = combo + 1;
      setCombo(nextCombo);
      setMaxCombo((prev) => Math.max(prev, nextCombo));
    }

    const multiplier = comboMultiplier(combo);
    setScore((prev) => prev + gained);
    say(
      judgement === "miss" ? "warn" : "good",
      practice
        ? `Stroke ${index + 1} ✓`
        : `${JUDGEMENT_LABEL[judgement]}${gained > 0 ? `  +${gained}` : ""}${
            multiplier > 1 && judgement !== "miss" ? `  ×${multiplier}` : ""
          }`,
    );
    blip(judgement === "perfect" ? "perfect" : judgement === "miss" ? "slip" : "hit");

    if (done) completeCharacter(current, notes, totals, endedAt);
  }

  function missStroke(current: Board, index: number, at: number): void {
    if (!claim(current.slot, index)) return;
    const notes = current.notes.map<Note>((note, i) =>
      i === index ? { status: "missed", judgement: "miss", quality: 0 } : note,
    );
    const done = firstPending(notes) < 0;
    setBoard({
      ...current,
      notes,
      beats: rescheduleAfter(current.beats, index, at, beat),
      finishedAt: done ? at : null,
    });
    setCombo(0);
    say("bad", `Missed stroke ${index + 1}`);
    blip("slip");
    if (done) {
      completeCharacter(
        current,
        notes,
        { hits: current.hits, perfect: current.perfect, points: current.points },
        at,
      );
    }
  }

  function handleTrace(path: Pt[], startedAt: number, endedAt: number): void {
    const current = board;
    if (!current || current.finishedAt !== null) return;
    const due = firstPending(current.notes);
    if (due < 0) return;

    const attempt = scoreTrace(path, current.data.medians[due], current.data.lengths[due]);
    if (attempt.ok) {
      landStroke(current, due, attempt.quality, startedAt, endedAt);
      return;
    }

    // Not the due stroke. Did they draw a different one? That is the mistake
    // this game exists to catch, and it deserves a named answer rather than a
    // generic "no".
    const others = current.data.medians.map((_, i) => i).filter((i) => i !== due);
    const match = identifyStroke(path, current.data, others);
    if (match) {
      setBoard({ ...current, orderErrors: current.orderErrors + 1 });
      setCombo(0);
      say(
        "bad",
        current.notes[match.index].status === "pending"
          ? `That is stroke ${match.index + 1}. Stroke ${due + 1} comes first.`
          : `Stroke ${match.index + 1} is already inked — stroke ${due + 1} is next.`,
      );
      blip("slip");
      return;
    }

    // Missed the line entirely: no combo break, the stroke stays due.
    say("warn", reasonText(attempt.reason, due));
  }

  /* ---------------- clock ---------------- */

  function tick(at: number): void {
    const current = board;
    if (!current || current.slot !== charIndex) return;
    if (current.finishedAt !== null || current.beats.length === 0) return;

    if (sound) {
      while (clickRef.current < current.beats.length && current.beats[clickRef.current] <= at) {
        blip("beat");
        clickRef.current += 1;
      }
    }

    // Never guillotine a stroke the player is in the middle of drawing.
    const drawingSince = drawingSinceRef.current;
    if (drawingSince !== null && at - drawingSince < MAX_TRACE_MS) return;
    const due = firstPending(current.notes);
    if (due < 0) return;
    if (at <= current.beats[due] + missWindow(beat)) return;
    missStroke(current, due, at);
  }

  const tickRef = useRef(tick);
  useEffect(() => {
    tickRef.current = tick;
  });

  useEffect(() => {
    if (phase !== "playing") return;
    let frame = 0;
    const loop = (at: number) => {
      tickRef.current(at);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  /* ---------------- timers ---------------- */

  const finishedAt = ready ? board.finishedAt : null;
  useEffect(() => {
    if (finishedAt === null) return;
    const id = window.setTimeout(() => afterCharacterRef.current(), REVIEW_MS);
    return () => window.clearTimeout(id);
  }, [finishedAt]);

  useEffect(() => {
    if (!flash) return;
    const id = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(id);
  }, [flash]);

  /* ---------------- render ---------------- */

  const stats =
    phase === "playing" ? (
      <>
        <StatChip label="Score" value={score.toLocaleString()} tone="text-gold" />
        <StatChip
          label="Combo"
          value={combo > 0 ? `${combo}×${comboMultiplier(combo)}` : "—"}
          tone={combo >= 4 ? "text-jade" : ""}
        />
        <StatChip
          label="Stroke"
          value={ready ? `${Math.max(dueIndex, 0) + 1}/${board.notes.length}` : "—"}
        />
        <StatChip label="Character" value={`${charIndex + 1}/${run?.queue.length ?? 0}`} />
      </>
    ) : (
      <>
        <StatChip label="Best" value={best === null ? "—" : best.toLocaleString()} />
        <StatChip
          label="Plays"
          value={hydrated ? progress.games.rhythm.plays.toLocaleString() : "—"}
        />
      </>
    );

  const controls =
    phase === "playing" ? (
      <div className="flex flex-wrap items-center gap-2">
        <Toggle pressed={guides} onClick={() => setGuides(!guides)} label="Guides" />
        <Toggle
          pressed={sound}
          onClick={() => {
            if (!sound) ensureAudio();
            setSound(!sound);
          }}
          label="Sound"
        />
        <ActionButton variant="ghost" onClick={finishRun}>
          End run
        </ActionButton>
      </div>
    ) : (
      <div className="flex flex-wrap items-center gap-3">
        <PillGroup
          label="HSK level"
          value={level}
          onChange={setLevel}
          options={PLAYABLE_LEVELS.map((value) => ({
            value,
            label: value === "all" ? "All levels" : `HSK ${value}`,
          }))}
        />
        <PillGroup label="Stroke count" value={band} onChange={setBand} options={BANDS} />
        <PillGroup
          label="Tempo"
          value={tempoId}
          onChange={setTempoId}
          options={TEMPOS.map((tempo) => ({ value: tempo.id, label: tempo.label }))}
        />
      </div>
    );

  return (
    <GameShell
      game="rhythm"
      stats={stats}
      controls={controls}
      footer={
        <p className="text-xs leading-relaxed text-muted">
          Order is scored hardest: a stroke drawn in the wrong place in the sequence
          scores nothing and breaks the combo, even if the shape is perfect. Shape only
          has to be close enough to tell which stroke you meant — and drawn the right way
          round. Timing then decides how many points the stroke is worth.
        </p>
      }
    >
      {phase === "setup" ? (
        <Setup
          poolSize={pool.length}
          practice={practice}
          tempoLabel={activeTempo.label}
          onStart={startRun}
        />
      ) : null}

      {phase === "playing" ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_17rem]">
          <div>
            <BeatLane
              beats={ready ? board.beats : []}
              notes={ready ? board.notes : []}
              beat={beat}
              dueIndex={dueIndex}
              reduced={reduced}
              practice={practice}
            />

            <div className="relative mx-auto mt-4 w-full max-w-[30rem]">
              <div className="texture-paper aspect-square rounded-3xl border border-line bg-card p-2 shadow-[0_1px_0_rgba(0,0,0,0.03)]">
                {ready ? (
                  <StrokeCanvas
                    data={board.data}
                    notes={board.notes}
                    dueIndex={dueIndex}
                    guides={guides}
                    reduced={reduced}
                    active={board.finishedAt === null}
                    onTrace={handleTrace}
                    onDrawingChange={(drawing, at) => {
                      drawingSinceRef.current = drawing ? at : null;
                    }}
                  />
                ) : (
                  <div className="grid h-full place-items-center text-sm text-muted">
                    Loading strokes…
                  </div>
                )}
              </div>

              <div
                className="pointer-events-none absolute inset-x-0 top-4 flex justify-center"
                aria-live="polite"
              >
                {flash ? (
                  <span
                    key={flash.key}
                    className={`rise-in rounded-full px-4 py-1.5 text-sm font-semibold shadow-sm ring-1 ${
                      flash.tone === "good"
                        ? "bg-card text-gold ring-gold/40"
                        : flash.tone === "warn"
                          ? "bg-card text-muted ring-line"
                          : "bg-card text-seal ring-seal/40"
                    }`}
                  >
                    {flash.text}
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <aside className="space-y-4">
            <div className="rounded-2xl border border-line bg-card p-4">
              <div className="flex items-baseline gap-3">
                <span className="font-hanzi text-4xl leading-none">{entry?.char}</span>
                <div>
                  <div className="text-sm font-medium text-seal">{entry?.pinyin}</div>
                  <div className="text-xs text-muted">
                    HSK {entry?.hsk} · {ready ? board.notes.length : entry?.strokes} strokes
                  </div>
                </div>
              </div>
              <p className="mt-3 line-clamp-3 text-sm leading-snug text-muted">
                {entry?.meanings[0]?.def}
              </p>
            </div>

            <div className="rounded-2xl border border-line bg-card-soft p-4 text-sm text-muted">
              <p className="font-medium text-foreground">
                {practice ? "Practice — no clock" : activeTempo.label}
              </p>
              <p className="mt-1 leading-relaxed">
                {dueIndex >= 0
                  ? guides
                    ? `Trace stroke ${dueIndex + 1} from the gold dot, following the arrow.`
                    : `Stroke ${dueIndex + 1} is highlighted. Guides are off.`
                  : "Character complete."}
              </p>
              {!practice ? (
                <p className="mt-2 leading-relaxed">
                  Start the stroke as its token hits the line. Missed strokes are inked in
                  grey so you still see the full order.
                </p>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}

      {phase === "results" ? (
        <Results
          results={results}
          score={score}
          maxCombo={maxCombo}
          best={best}
          practice={practice}
          onPlayAgain={startRun}
          onChangeSettings={() => setPhase("setup")}
        />
      ) : null}
    </GameShell>
  );
}

function Toggle({
  pressed,
  onClick,
  label,
}: {
  pressed: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
        pressed
          ? "border-gold/40 bg-gold/10 text-gold"
          : "border-line bg-card text-muted hover:text-foreground"
      }`}
    >
      <span className={`size-1.5 rounded-full ${pressed ? "bg-gold" : "bg-muted"}`} aria-hidden />
      {label}
    </button>
  );
}

function Setup({
  poolSize,
  practice,
  tempoLabel,
  onStart,
}: {
  poolSize: number;
  practice: boolean;
  tempoLabel: string;
  onStart: () => void;
}) {
  return (
    <section className="rise-in grid gap-6 rounded-3xl border border-line bg-card p-6 sm:p-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">笔顺 — write it in order</h2>
        <ol className="mt-4 space-y-2 text-sm leading-relaxed text-muted">
          <li>
            <strong className="font-medium text-foreground">1.</strong> The character
            appears as a faint ghost. One stroke lights up gold at a time.
          </li>
          <li>
            <strong className="font-medium text-foreground">2.</strong> Trace it from the
            gold dot, following the arrow. Dots (丶) can just be tapped.
          </li>
          <li>
            <strong className="font-medium text-foreground">3.</strong> At a tempo, start
            each stroke as its token reaches the line. Consecutive clean strokes build a
            combo multiplier, up to 4×.
          </li>
          <li>
            <strong className="font-medium text-foreground">4.</strong> Trace the wrong
            stroke and the combo breaks — order is the thing being marked.
          </li>
        </ol>
        <p className="mt-4 rounded-2xl border border-line bg-card-soft px-4 py-3 text-sm text-muted">
          This game needs a mouse, trackpad, stylus or touchscreen — the strokes have to be
          drawn. Everything around the board (level, tempo, results) is keyboard-operable.
        </p>
      </div>

      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-line bg-card-soft p-5">
        <div className="text-sm text-muted">
          <p>
            <span className="font-medium text-foreground">{poolSize}</span> characters in
            the pool.
          </p>
          <p className="mt-1">
            {practice ? (
              <>
                Practice mode: strokes wait for you and the run is not scored against your
                best.
              </>
            ) : (
              <>
                Tempo <span className="font-medium text-foreground">{tempoLabel}</span>.
                Reviews come first, so overdue characters show up sooner.
              </>
            )}
          </p>
        </div>
        <ActionButton onClick={onStart} disabled={poolSize === 0}>
          {poolSize === 0 ? "No characters match" : `Start ${ROUND_SIZE}-character run`}
        </ActionButton>
      </div>
    </section>
  );
}
