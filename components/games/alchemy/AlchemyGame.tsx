"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { HskBadge } from "@/components/HskBadge";
import {
  ActionButton,
  GameShell,
  PillGroup,
  StatChip,
} from "@/components/games/GameShell";
import { DiscoveryLog } from "@/components/games/alchemy/DiscoveryLog";
import { ElementTile, SlotBox } from "@/components/games/alchemy/ElementTile";
import {
  CRAFTABLE,
  CRAFTABLE_TOTAL,
  buildBench,
  entryFor,
  fuse,
  getElement,
  partsFor,
  type AlchemyElement,
} from "@/lib/alchemy";
import { LEVEL_STYLES, slugFor, type HskLevel } from "@/lib/characters";
import { GAMES, PLAYABLE_LEVELS } from "@/lib/games";
import {
  pickForReview,
  recordAnswer,
  recordDiscovery,
  recordSession,
  useHydrated,
  useProgress,
  type ProgressState,
} from "@/lib/progress";

/** A run is eight targets long — roughly five minutes, and it always ends. */
const TARGETS_PER_RUN = 8;
const SOLVE_POINTS = 10;
/** A hinted solve is still a solve, just worth half of one. */
const SOLVE_HINTED_POINTS = 5;
/** Stumbling onto a character you were not hunting for is the point of the game. */
const BONUS_POINTS = 3;
/** Failed combinations before the next clue unlocks. */
const MISSES_PER_HINT = 2;

const ACCENT = GAMES.alchemy.accent;

type PuzzleStatus = "open" | "solved" | "skipped";

interface Puzzle {
  char: string;
  startedAt: number;
  misses: number;
  /** 0 none, 1 pronunciation, 2 one of the two parts. */
  hintLevel: number;
  status: PuzzleStatus;
}

interface Attempt {
  /** Bumped per attempt so the shake animation restarts on a repeat miss. */
  id: number;
  a: string;
  b: string;
  results: string[];
  fresh: string[];
  hitTarget: boolean;
}

interface RunState {
  active: boolean;
  done: boolean;
  score: number;
  targets: number;
  solved: number;
  skipped: number;
  /** New characters found during this run, targets included. */
  finds: number;
  startedAt: number;
}

const IDLE_RUN: RunState = {
  active: false,
  done: false,
  score: 0,
  targets: 0,
  solved: 0,
  skipped: 0,
  finds: 0,
  startedAt: 0,
};

/**
 * Draw the next target review-first, so a character the learner is shaky on in
 * any other game gets queued here before untouched material.
 */
function nextPuzzle(pool: string[], progress: ProgressState, now: number): Puzzle | null {
  if (pool.length === 0) return null;
  const [choice] = pickForReview(
    progress,
    pool.map((char) => ({ char })),
    1,
    now,
  );
  if (!choice) return null;
  return { char: choice.char, startedAt: now, misses: 0, hintLevel: 0, status: "open" };
}

export function AlchemyGame() {
  const progress = useProgress();
  const hydrated = useHydrated();

  const [level, setLevel] = useState<HskLevel | "all">("all");
  const [slot, setSlot] = useState<string | null>(null);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  /** Set when a target is skipped: the answer is shown but never collected. */
  const [answer, setAnswer] = useState<string | null>(null);
  const [puzzle, setPuzzle] = useState<Puzzle | null>(null);
  const [run, setRun] = useState<RunState>(IDLE_RUN);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"all" | "parts" | "chars">("all");
  const attemptId = useRef(0);

  const bench = useMemo(
    () => buildBench(progress.discovered, level),
    [progress.discovered, level],
  );
  const discovered = useMemo(
    () => new Set(progress.discovered),
    [progress.discovered],
  );
  // Counted against CRAFTABLE rather than the raw list so the readout can never
  // read "445 of 444" if the stored list ever picks up something unexpected.
  const foundCount = useMemo(
    () => CRAFTABLE.filter((char) => discovered.has(char)).length,
    [discovered],
  );

  /* ---- run lifecycle ------------------------------------------------ */

  const finishRun = useCallback(() => {
    if (!run.active) return;
    recordSession({
      game: "alchemy",
      score: run.score,
      durationMs: Date.now() - run.startedAt,
    });
    setRun((prev) => ({ ...prev, active: false, done: true }));
    setPuzzle(null);
    setSlot(null);
  }, [run.active, run.score, run.startedAt]);

  // A run that is abandoned mid-way still happened: record it on the way out
  // so the dashboard's play count matches reality. The ref is synced in an
  // effect rather than during render so the value the cleanup sees is current.
  const runRef = useRef(run);
  useEffect(() => {
    runRef.current = run;
  }, [run]);
  useEffect(
    () => () => {
      const last = runRef.current;
      if (!last.active || last.targets === 0) return;
      recordSession({
        game: "alchemy",
        score: last.score,
        durationMs: Date.now() - last.startedAt,
      });
    },
    [],
  );

  const startRun = useCallback(() => {
    const now = Date.now();
    setRun({ ...IDLE_RUN, active: true, startedAt: now });
    setAttempt(null);
    setAnswer(null);
    setSlot(null);
    setPuzzle(nextPuzzle(bench.targetPool, progress, now));
  }, [bench.targetPool, progress]);

  const advance = useCallback(() => {
    setAttempt(null);
    setAnswer(null);
    setSlot(null);
    if (run.targets >= TARGETS_PER_RUN) {
      finishRun();
      return;
    }
    setPuzzle(nextPuzzle(bench.targetPool, progress, Date.now()));
  }, [run.targets, bench.targetPool, progress, finishRun]);

  /* ---- combining ---------------------------------------------------- */

  const attemptFusion = useCallback(
    (a: string, b: string) => {
      if (!bench.held.has(a) || !bench.held.has(b)) return;
      const id = attemptId.current + 1;
      attemptId.current = id;

      const outcome = fuse(a, b, bench.held);
      setSlot(null);
      setAnswer(null);

      if (outcome.kind === "none") {
        setAttempt({ id, a, b, results: [], fresh: [], hitTarget: false });
        setPuzzle((prev) =>
          prev && prev.status === "open" ? { ...prev, misses: prev.misses + 1 } : prev,
        );
        return;
      }

      const target = puzzle?.status === "open" ? puzzle.char : null;
      const hitTarget = target !== null && outcome.results.includes(target);

      // `recordDiscovery` is the authority on newness — it is reading the same
      // persisted list the bench was built from, but it is the one that writes.
      const fresh: string[] = [];
      let gained = 0;
      for (const char of outcome.results) {
        if (!recordDiscovery(char, char === target)) continue;
        fresh.push(char);
        if (char !== target) gained += BONUS_POINTS;
      }

      if (hitTarget && puzzle && target) {
        const hinted = puzzle.hintLevel > 0;
        gained += hinted ? SOLVE_HINTED_POINTS : SOLVE_POINTS;
        recordAnswer({
          char: target,
          correct: true,
          game: "alchemy",
          ms: Date.now() - puzzle.startedAt,
          weight: hinted ? 0.5 : 1,
        });
        setPuzzle({ ...puzzle, status: "solved" });
      }

      if (run.active) {
        setRun((prev) => ({
          ...prev,
          score: prev.score + gained,
          finds: prev.finds + fresh.length,
          targets: hitTarget ? prev.targets + 1 : prev.targets,
          solved: hitTarget ? prev.solved + 1 : prev.solved,
        }));
      }

      setAttempt({ id, a, b, results: outcome.results, fresh, hitTarget });
    },
    [bench.held, puzzle, run.active],
  );

  /** A tile was chosen: fill the empty slot, or fuse with what is already there. */
  const pick = useCallback(
    (key: string) => {
      if (slot === null) {
        setSlot(key);
        setAttempt(null);
        setAnswer(null);
        return;
      }
      attemptFusion(slot, key);
    },
    [slot, attemptFusion],
  );

  const clearBench = useCallback(() => {
    setSlot(null);
    setAttempt(null);
    setAnswer(null);
  }, []);

  // Escape is the universal "never mind" — it works from the tiles, the slots
  // and the search box, so a keyboard player is never stuck holding an element.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setSlot(null);
      setAttempt(null);
      setAnswer(null);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  /* ---- hints + skipping --------------------------------------------- */

  const hintsUnlocked = puzzle
    ? Math.min(2, Math.floor(puzzle.misses / MISSES_PER_HINT))
    : 0;
  const canHint =
    puzzle?.status === "open" && puzzle.hintLevel < 2 && hintsUnlocked > puzzle.hintLevel;

  const revealHint = useCallback(() => {
    setPuzzle((prev) =>
      prev && prev.status === "open"
        ? { ...prev, hintLevel: Math.min(2, prev.hintLevel + 1) }
        : prev,
    );
  }, []);

  const skip = useCallback(() => {
    if (!puzzle || puzzle.status !== "open") return;
    recordAnswer({
      char: puzzle.char,
      correct: false,
      game: "alchemy",
      ms: Date.now() - puzzle.startedAt,
    });
    setPuzzle({ ...puzzle, status: "skipped" });
    setAnswer(puzzle.char);
    setAttempt(null);
    setSlot(null);
    setRun((prev) =>
      prev.active
        ? { ...prev, targets: prev.targets + 1, skipped: prev.skipped + 1 }
        : prev,
    );
  }, [puzzle]);

  /* ---- inventory ----------------------------------------------------- */

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const out: AlchemyElement[] = [];
    for (const key of bench.inventory) {
      const element = getElement(key);
      if (!element) continue;
      if (scope === "parts" && element.kind !== "part") continue;
      if (scope === "chars" && element.kind !== "character") continue;
      if (needle && !element.haystack.includes(needle)) continue;
      out.push(element);
    }
    return out;
  }, [bench.inventory, query, scope]);

  const slotElement = slot ? getElement(slot) : undefined;
  const targetEntry = puzzle ? entryFor(puzzle.char) : undefined;
  const targetParts = puzzle ? partsFor(puzzle.char) : undefined;
  // `run.targets` counts finished targets, so the one on screen is the next
  // number up only while it is still open.
  const targetIndex = Math.min(
    run.targets + (puzzle?.status === "open" ? 1 : 0),
    TARGETS_PER_RUN,
  );

  return (
    <GameShell
      game="alchemy"
      stats={
        <>
          <StatChip label="Score" value={hydrated ? run.score : "—"} tone={ACCENT.text} />
          <StatChip
            label="Target"
            value={hydrated ? `${targetIndex}/${TARGETS_PER_RUN}` : "—"}
          />
          <StatChip
            label="Discovered"
            value={hydrated ? `${foundCount}/${CRAFTABLE_TOTAL}` : "—"}
          />
        </>
      }
      controls={
        <div className="flex flex-wrap items-center gap-3">
          <PillGroup
            label="Target difficulty"
            value={level}
            onChange={setLevel}
            options={PLAYABLE_LEVELS.map((option) =>
              option === "all"
                ? { value: option, label: "All levels" }
                : {
                    value: option,
                    label: LEVEL_STYLES[option].label,
                    dot: LEVEL_STYLES[option].dot,
                  },
            )}
          />
          {run.active ? (
            <ActionButton variant="ghost" onClick={finishRun}>
              Finish run
            </ActionButton>
          ) : null}
          <p className="text-xs text-muted">
            {bench.primitiveCount} parts on the bench &middot;{" "}
            {bench.targetPool.length} characters still to build
          </p>
        </div>
      }
      footer={<DiscoveryLog discovered={discovered} />}
    >
      <style>{`
        @keyframes alchemyShake {
          0%, 100% { transform: translateX(0); }
          20% { transform: translateX(-5px); }
          40% { transform: translateX(5px); }
          60% { transform: translateX(-3px); }
          80% { transform: translateX(3px); }
        }
        @keyframes alchemyPop {
          0% { transform: scale(1); }
          35% { transform: scale(1.12); }
          100% { transform: scale(1); }
        }
        .alchemy-shake { animation: alchemyShake 0.4s ease-in-out both; }
        .alchemy-pop { animation: alchemyPop 0.7s ease-out both; }
        @media (prefers-reduced-motion: reduce) {
          .alchemy-shake, .alchemy-pop { animation: none; }
        }
      `}</style>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)] lg:items-start">
        {/* Quest + cauldron */}
        {/* Sticky so the quest stays put while the bench is scrolled; capped in
            height so a tall discovery card can never run off the screen. */}
        <div className="flex flex-col gap-5 lg:sticky lg:top-4 lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto lg:pr-1">
          <section
            className={`rounded-3xl border border-line bg-card p-5 ${
              puzzle?.status === "open" ? `ring-1 ${ACCENT.ring}` : ""
            }`}
            aria-live="polite"
          >
            {run.done ? (
              <RunSummary run={run} onRestart={startRun} />
            ) : puzzle && targetEntry ? (
              <>
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-[0.65rem] font-semibold tracking-wider text-muted uppercase">
                    Target {targetIndex} of {TARGETS_PER_RUN}
                  </h2>
                  <HskBadge level={targetEntry.hsk} />
                </div>

                {puzzle.status === "open" ? (
                  <>
                    <p className="mt-3 text-xs text-muted">Build the character meaning</p>
                    <p className="mt-1 text-xl leading-snug font-semibold">
                      {targetEntry.meanings[0]?.def}
                    </p>
                    <p className="mt-1 font-mono text-[0.7rem] text-muted lowercase">
                      {targetEntry.meanings[0]?.pos} &middot; {targetEntry.strokes} strokes
                    </p>

                    <div className="mt-4 min-h-14 rounded-xl border border-dashed border-line bg-card-soft/60 px-3 py-2.5 text-sm">
                      {puzzle.hintLevel === 0 ? (
                        <span className="text-muted">
                          {puzzle.misses === 0
                            ? "Two parts, fused. Combos that miss still find other characters."
                            : `${puzzle.misses} combination${puzzle.misses === 1 ? "" : "s"} tried — clues unlock as you go.`}
                        </span>
                      ) : (
                        <ul className="space-y-1">
                          <li>
                            It is pronounced{" "}
                            <span className="font-medium text-seal">
                              {targetEntry.pinyin}
                            </span>
                            .
                          </li>
                          {puzzle.hintLevel > 1 && targetParts ? (
                            <li>
                              One of its two parts is{" "}
                              <span className="font-hanzi text-base">
                                {targetParts[0]}
                              </span>{" "}
                              <span className="text-muted">
                                ({getElement(targetParts[0])?.gloss})
                              </span>
                              .
                            </li>
                          ) : null}
                        </ul>
                      )}
                    </div>

                    <div className="mt-4 flex flex-wrap gap-2">
                      <ActionButton variant="ghost" onClick={revealHint} disabled={!canHint}>
                        {canHint
                          ? puzzle.hintLevel === 0
                            ? "Reveal a clue"
                            : "Another clue"
                          : puzzle.hintLevel >= 2
                            ? "No clues left"
                            : `Clue after ${
                                MISSES_PER_HINT * (puzzle.hintLevel + 1) - puzzle.misses
                              } more tries`}
                      </ActionButton>
                      <ActionButton variant="ghost" onClick={skip}>
                        Skip
                      </ActionButton>
                    </div>
                  </>
                ) : (
                  <SolvedPanel
                    puzzle={puzzle}
                    last={run.targets >= TARGETS_PER_RUN}
                    onAdvance={advance}
                  />
                )}
              </>
            ) : (
              <IntroPanel
                onStart={startRun}
                available={bench.targetPool.length}
                ready={hydrated}
              />
            )}
          </section>

          <section
            className="rounded-3xl border border-line bg-card p-5"
            aria-label="Fusion bench"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-[0.65rem] font-semibold tracking-wider text-muted uppercase">
                Fuse
              </h2>
              {slot || attempt || answer ? (
                <button
                  type="button"
                  onClick={clearBench}
                  className="cursor-pointer text-xs text-muted underline-offset-4 transition hover:text-foreground hover:underline"
                >
                  Clear (Esc)
                </button>
              ) : null}
            </div>

            <div
              key={attempt?.id ?? "idle"}
              className={`mt-3 flex items-stretch gap-2 ${
                attempt && attempt.results.length === 0 ? "alchemy-shake" : ""
              }`}
            >
              <SlotBox
                index={1}
                element={attempt ? getElement(attempt.a) : slotElement}
                onDropElement={pick}
                onClear={slot && !attempt ? clearBench : undefined}
              />
              <span
                className="self-center text-xl font-light text-muted/60 select-none"
                aria-hidden
              >
                +
              </span>
              <SlotBox
                index={2}
                element={attempt ? getElement(attempt.b) : undefined}
                onDropElement={pick}
              />
            </div>

            <div className="mt-3" aria-live="polite">
              {attempt && attempt.results.length === 0 ? (
                <p className="rounded-xl border border-dashed border-seal/35 bg-seal-soft/50 px-3 py-2.5 text-sm">
                  <span className="font-hanzi">{attempt.a}</span> +{" "}
                  <span className="font-hanzi">{attempt.b}</span> is not a character.
                  Nothing lost — try another pairing.
                </p>
              ) : attempt ? (
                <div className="space-y-3">
                  {attempt.results.map((char) => (
                    <DiscoveryCard
                      key={char}
                      char={char}
                      a={attempt.a}
                      b={attempt.b}
                      isNew={attempt.fresh.includes(char)}
                      isTarget={attempt.hitTarget && puzzle?.char === char}
                    />
                  ))}
                </div>
              ) : answer ? (
                <DiscoveryCard char={answer} skipped />
              ) : (
                <p className="text-sm text-muted">
                  Pick two elements — click them, or drag one onto the other.
                </p>
              )}
            </div>
          </section>
        </div>

        {/* Inventory */}
        <section
          className="rounded-3xl border border-line bg-card p-5"
          aria-label="Inventory"
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold tracking-tight">
              Bench{" "}
              <span className="ml-1 text-sm font-normal text-muted tabular-nums">
                {visible.length} element{visible.length === 1 ? "" : "s"}
              </span>
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              <PillGroup
                label="Element type"
                value={scope}
                onChange={setScope}
                options={[
                  { value: "all", label: "All" },
                  { value: "parts", label: "Parts" },
                  { value: "chars", label: "Characters" },
                ]}
              />
              <label className="relative">
                <span className="sr-only">Search elements by character, pinyin or meaning</span>
                <input
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search 水, shui, water…"
                  className="w-44 rounded-full border border-line bg-card-soft px-4 py-2 text-sm outline-none placeholder:text-muted/70 focus:border-jade/50"
                />
              </label>
            </div>
          </div>

          {slotElement ? (
            <p className={`mt-3 rounded-xl px-3 py-2 text-sm ${ACCENT.soft} ${ACCENT.text}`}>
              Holding <span className="font-hanzi text-base">{slotElement.key}</span> — pick
              a second element to fuse.
            </p>
          ) : null}

          <div className="mt-4 max-h-[30rem] overflow-y-auto pr-1">
            {visible.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted">
                Nothing on the bench matches that.
              </p>
            ) : (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(4.75rem,1fr))] gap-2">
                {visible.map((element) => (
                  <li key={element.key}>
                    <ElementTile
                      element={element}
                      selected={slot === element.key}
                      highlighted={attempt?.fresh.includes(element.key) ?? false}
                      onPick={pick}
                      onCombine={attemptFusion}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          <p className="mt-4 text-xs leading-relaxed text-muted">
            Dashed tiles are components — parts like 亻 or 讠 that only live inside other
            characters. Solid tiles are characters you can look up.
          </p>
        </section>
      </div>
    </GameShell>
  );
}

/* ------------------------------------------------------------------ *
 * Panels
 * ------------------------------------------------------------------ */

function IntroPanel({
  onStart,
  available,
  ready,
}: {
  onStart: () => void;
  available: number;
  ready: boolean;
}) {
  return (
    <>
      <h2 className="text-[0.65rem] font-semibold tracking-wider text-muted uppercase">
        Ready
      </h2>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        A run is {TARGETS_PER_RUN} targets. Each one names a meaning; you build the
        character out of the parts on your bench. Anything else you fuse along the way is
        yours to keep.
      </p>
      <p className="mt-3 text-sm text-muted">
        <span className="font-semibold text-foreground tabular-nums">{available}</span>{" "}
        characters are within reach right now.
      </p>
      <div className="mt-4">
        <ActionButton onClick={onStart} disabled={!ready || available === 0}>
          Start a run
        </ActionButton>
      </div>
      {ready && available === 0 ? (
        <p className="mt-3 text-xs text-muted">
          Nothing left at this level — try another one.
        </p>
      ) : null}
    </>
  );
}

function SolvedPanel({
  puzzle,
  last,
  onAdvance,
}: {
  puzzle: Puzzle;
  last: boolean;
  onAdvance: () => void;
}) {
  const entry = entryFor(puzzle.char);
  const solved = puzzle.status === "solved";
  return (
    <>
      <div className="mt-3 flex items-center gap-4">
        <span
          className={`grid size-16 shrink-0 place-items-center rounded-2xl font-hanzi text-4xl leading-none ${
            solved ? "bg-jade/10 text-jade ring-1 ring-jade/30" : "bg-card-soft text-muted"
          }`}
        >
          {puzzle.char}
        </span>
        <div className="min-w-0">
          <p
            className={`text-sm font-semibold ${solved ? "text-jade" : "text-muted"}`}
          >
            {solved
              ? puzzle.hintLevel > 0
                ? "Solved with a clue"
                : "Solved"
              : "Skipped — the answer was"}
          </p>
          <p className="mt-0.5 truncate text-sm text-seal">{entry?.pinyin}</p>
          <p className="truncate text-xs text-muted">{entry?.meanings[0]?.def}</p>
        </div>
      </div>
      <div className="mt-4">
        <ActionButton onClick={onAdvance}>
          {last ? "See results" : "Next target"}
        </ActionButton>
      </div>
    </>
  );
}

function RunSummary({ run, onRestart }: { run: RunState; onRestart: () => void }) {
  return (
    <>
      <h2 className="text-[0.65rem] font-semibold tracking-wider text-muted uppercase">
        Run complete
      </h2>
      <p className={`mt-2 text-4xl font-semibold tabular-nums ${ACCENT.text}`}>
        {run.score}
      </p>
      <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
        <Tally label="Solved" value={run.solved} />
        <Tally label="Skipped" value={run.skipped} />
        <Tally label="Found" value={run.finds} />
      </dl>
      <div className="mt-4">
        <ActionButton onClick={onRestart}>Play again</ActionButton>
      </div>
    </>
  );
}

function Tally({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-line bg-card-soft px-2 py-2">
      <dt className="text-[0.6rem] font-semibold tracking-wider text-muted uppercase">
        {label}
      </dt>
      <dd className="mt-0.5 text-lg font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

/**
 * The payoff card. `compositionNote` is the whole reason the game exists — it
 * says why these two parts mean this thing, which is what turns a lucky
 * combination into something the learner keeps.
 */
function DiscoveryCard({
  char,
  a,
  b,
  isNew = false,
  isTarget = false,
  skipped = false,
}: {
  char: string;
  a?: string;
  b?: string;
  isNew?: boolean;
  isTarget?: boolean;
  skipped?: boolean;
}) {
  const entry = entryFor(char);
  if (!entry) return null;
  const parts = partsFor(char);
  const left = a ?? parts?.[0];
  const right = b ?? parts?.[1];

  const badge = skipped
    ? { text: "Not collected", className: "bg-card-soft text-muted" }
    : isTarget
      ? { text: "Target solved", className: "bg-seal-soft text-seal" }
      : isNew
        ? { text: "New discovery", className: "bg-jade/12 text-jade" }
        : { text: "Already yours", className: "bg-card-soft text-muted" };

  return (
    <article
      className={`rise-in rounded-2xl border p-4 ${
        skipped ? "border-line bg-card-soft/60" : "border-jade/35 bg-jade/5"
      }`}
    >
      <div className="flex items-start gap-4">
        <Link
          href={`/character/${slugFor(char)}`}
          className="grid size-16 shrink-0 place-items-center rounded-2xl border border-line bg-card font-hanzi text-4xl leading-none transition hover:-translate-y-0.5 hover:border-jade/50"
          aria-label={`Open the detail page for ${char}`}
        >
          {char}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`rounded-full px-2 py-0.5 text-[0.6rem] font-semibold tracking-wider uppercase ${badge.className}`}
            >
              {badge.text}
            </span>
            <HskBadge level={entry.hsk} />
          </div>
          <p className="mt-1.5 text-sm font-medium text-seal">{entry.pinyin}</p>
          <p className="text-sm">{entry.meanings[0]?.def}</p>
          {left && right ? (
            <p className="mt-1 font-hanzi text-xs text-muted">
              {left} + {right} = {char}
            </p>
          ) : null}
        </div>
      </div>
      <p className="mt-3 border-l-2 border-line pl-3 text-[0.8rem] leading-relaxed text-muted italic">
        {entry.compositionNote}
      </p>
    </article>
  );
}
