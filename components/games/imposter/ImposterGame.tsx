"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type RefObject,
} from "react";

import { ActionButton, GameShell, PillGroup, StatChip } from "@/components/games/GameShell";
import { HskBadge } from "@/components/HskBadge";
import { OptionTile, type TileState } from "@/components/games/imposter/OptionTile";
import { Kbd, RunSummary, type RunAnswer } from "@/components/games/imposter/RunSummary";
import type { HskLevel } from "@/lib/characters";
import {
  RUN_LIVES,
  RUN_ROUNDS,
  buildRun,
  describe,
  discriminator,
  eligibleTargets,
  roundPoints,
  type ConfusableChar,
  type ImposterRound,
} from "@/lib/confusables";
import { PLAYABLE_LEVELS } from "@/lib/games";
import {
  pickForReview,
  recordAnswers,
  recordSession,
  useHydrated,
  useProgress,
  type AnswerInput,
} from "@/lib/progress";

type Level = HskLevel | "all";

type Phase = "idle" | "playing" | "reveal" | "over";

interface GameState {
  phase: Phase;
  rounds: ImposterRound[];
  index: number;
  answers: RunAnswer[];
  score: number;
  /** Consecutive correct answers — feeds the score multiplier. */
  streak: number;
  lives: number;
  /** Epoch ms, for the session duration. */
  startedAt: number;
  /** Epoch ms the run ended — captured on the transition, never read from a clock during render. */
  endedAt: number;
  /** `performance.now()` value at which the current round expires. */
  deadline: number;
  /** The tile the player chose, during a reveal. Null means the clock won. */
  picked: string | null;
  lastCorrect: boolean;
}

const IDLE: GameState = {
  phase: "idle",
  rounds: [],
  index: 0,
  answers: [],
  score: 0,
  streak: 0,
  lives: RUN_LIVES,
  startedAt: 0,
  endedAt: 0,
  deadline: 0,
  picked: null,
  lastCorrect: false,
};

/** How long the reveal stays up before the next round starts, in ms. */
const HOLD_CORRECT = 850;
const HOLD_WRONG = 3400;

/* ------------------------------------------------------------------ *
 * prefers-reduced-motion, read as an external store so there is no
 * setState-in-effect and no hydration mismatch (the server answers "false").
 * ------------------------------------------------------------------ */

const REDUCED_QUERY = "(prefers-reduced-motion: reduce)";

function subscribeReduced(onChange: () => void): () => void {
  const query = window.matchMedia(REDUCED_QUERY);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function useReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribeReduced,
    () => window.matchMedia(REDUCED_QUERY).matches,
    () => false,
  );
}

/** Whole-string classes so Tailwind keeps them in the build. */
const TILE_GRID: Record<number, string> = {
  2: "grid-cols-2",
  3: "grid-cols-2 sm:grid-cols-3",
  4: "grid-cols-2 sm:grid-cols-4",
};

export function ImposterGame() {
  const progress = useProgress();
  const hydrated = useHydrated();
  const reduced = useReducedMotion();

  const [level, setLevel] = useState<Level>("all");
  const [state, setState] = useState<GameState>(IDLE);

  const barRef = useRef<HTMLDivElement | null>(null);
  const clockRef = useRef<HTMLSpanElement | null>(null);

  const round: ImposterRound | undefined = state.rounds[state.index];

  const start = useCallback(() => {
    const pool = eligibleTargets(level).map((char) => ({ char }));
    // Ask for more candidates than rounds: some characters will not form a
    // round at the difficulty the curve wants, and those are skipped.
    const ordered = pickForReview(progress, pool, RUN_ROUNDS * 3).map((c) => c.char);
    const rounds = buildRun(ordered, Math.random);
    if (rounds.length === 0) return;

    setState({
      ...IDLE,
      phase: "playing",
      rounds,
      startedAt: Date.now(),
      deadline: performance.now() + rounds[0].limitMs,
    });
  }, [level, progress]);

  /** Resolve the current round. `picked` is null when the timer ran out. */
  const submit = useCallback(
    (picked: string | null) => {
      if (state.phase !== "playing") return;
      const current = state.rounds[state.index];
      if (!current) return;

      const msLeft = Math.max(0, state.deadline - performance.now());
      const ms = current.limitMs - msLeft;
      const correct = picked === current.target.char;
      const points = correct
        ? roundPoints({
            msLeft,
            limitMs: current.limitMs,
            options: current.options.length,
            streak: state.streak,
          })
        : 0;

      // One write per round. A wrong pick is logged against *both* characters:
      // choosing 末 for 未 is evidence about 末 as well.
      const writes: AnswerInput[] = [
        { char: current.target.char, correct, game: "imposter", ms },
      ];
      if (!correct && picked && describe(picked).inDataset) {
        writes.push({ char: picked, correct: false, game: "imposter", ms });
      }
      recordAnswers(writes);

      setState({
        ...state,
        phase: "reveal",
        picked,
        lastCorrect: correct,
        score: state.score + points,
        streak: correct ? state.streak + 1 : 0,
        lives: correct ? state.lives : state.lives - 1,
        answers: [
          ...state.answers,
          { target: current.target.char, picked, correct, ms, points },
        ],
      });
    },
    [state],
  );

  const advance = useCallback(() => {
    if (state.phase !== "reveal") return;
    const next = state.index + 1;
    if (state.lives <= 0 || next >= state.rounds.length) {
      recordSession({
        game: "imposter",
        score: state.score,
        durationMs: Date.now() - state.startedAt,
      });
      setState({ ...state, phase: "over", endedAt: Date.now() });
      return;
    }
    setState({
      ...state,
      phase: "playing",
      index: next,
      picked: null,
      deadline: performance.now() + state.rounds[next].limitMs,
    });
  }, [state]);

  /*
   * The countdown writes straight to the DOM instead of to React state: at 60fps
   * a state-driven bar would re-render the whole board every frame, and nothing
   * else on screen changes while the clock runs.
   */
  useEffect(() => {
    if (state.phase !== "playing" || !round) return;
    const { deadline } = state;
    const { limitMs } = round;
    let frame = 0;

    const paint = () => {
      const left = Math.max(0, deadline - performance.now());
      const fraction = left / limitMs;
      if (barRef.current) {
        // Reduced motion gets a stepped bar rather than a continuous slide.
        const shown = reduced ? Math.ceil(fraction * 10) / 10 : fraction;
        barRef.current.style.transform = `scaleX(${shown})`;
      }
      if (clockRef.current) {
        clockRef.current.textContent = reduced
          ? `${Math.ceil(left / 1000)}`
          : (left / 1000).toFixed(1);
      }
      if (left <= 0) {
        submit(null);
        return;
      }
      frame = requestAnimationFrame(paint);
    };

    frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
  }, [state, round, reduced, submit]);

  /*
   * requestAnimationFrame stops firing in a hidden tab, but the deadline is an
   * absolute timestamp — without this, switching away mid-round and coming back
   * would be an instant miss. Give the time back instead.
   */
  useEffect(() => {
    if (state.phase !== "playing") return;
    let hiddenAt = 0;
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = performance.now();
        return;
      }
      if (!hiddenAt) return;
      const away = performance.now() - hiddenAt;
      hiddenAt = 0;
      setState((prev) =>
        prev.phase === "playing" ? { ...prev, deadline: prev.deadline + away } : prev,
      );
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [state.phase]);

  /* Reveal, then straight into the next round — the pace is the point. */
  useEffect(() => {
    if (state.phase !== "reveal") return;
    const id = window.setTimeout(advance, state.lastCorrect ? HOLD_CORRECT : HOLD_WRONG);
    return () => window.clearTimeout(id);
  }, [state.phase, state.lastCorrect, advance]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Enter" || event.key === " ") {
        if (state.phase === "idle" || state.phase === "over") {
          event.preventDefault();
          start();
        } else if (state.phase === "reveal") {
          event.preventDefault();
          advance();
        }
        return;
      }
      if (state.phase !== "playing" || !round) return;
      const slot = Number(event.key);
      if (Number.isInteger(slot) && slot >= 1 && slot <= round.options.length) {
        event.preventDefault();
        submit(round.options[slot - 1].char);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [state.phase, round, start, advance, submit]);

  const best = progress.games.imposter?.best ?? 0;
  const playing = state.phase === "playing" || state.phase === "reveal";

  return (
    <GameShell
      game="imposter"
      stats={
        <>
          <StatChip label="Score" value={state.score} />
          <StatChip
            label="Round"
            value={playing ? `${state.index + 1}/${state.rounds.length}` : `–`}
          />
          <StatChip
            label="Lives"
            value={"♦".repeat(Math.max(0, state.lives)) || "—"}
            tone={state.lives <= 1 ? "text-seal" : "text-jade"}
          />
          <StatChip label="Best" value={hydrated ? best : "–"} tone="text-gold" />
        </>
      }
      controls={
        <div className="flex flex-wrap items-center gap-3">
          <PillGroup<Level>
            label="HSK level"
            options={PLAYABLE_LEVELS.map((value) => ({
              value,
              label: value === "all" ? "All levels" : `HSK ${value}`,
            }))}
            value={level}
            onChange={setLevel}
            disabled={playing}
          />
          {playing ? (
            <ActionButton variant="ghost" onClick={() => setState(IDLE)}>
              End run
            </ActionButton>
          ) : null}
        </div>
      }
      footer={
        <p className="max-w-2xl text-xs leading-relaxed text-muted">
          Sets come from two places: a hand-curated list of the classic traps
          (己/已/巳, 请/清/情/晴, 十/千/干/土/士) and a similarity pass over every
          character in HSK 1–3 that scores shared components, shared radicals,
          stroke count and shared sound. A few distractors sit outside HSK 1–3 —
          they are only ever wrong answers, never the one you are asked for.
        </p>
      }
    >
      {state.phase === "over" ? (
        <RunSummary
          answers={state.answers}
          score={state.score}
          best={best}
          bestKnown={hydrated}
          durationMs={state.endedAt - state.startedAt}
          onPlayAgain={start}
        />
      ) : state.phase === "idle" || !round ? (
        <StartCard onStart={start} />
      ) : (
        <section>
          <Prompt round={round} clockRef={clockRef} barRef={barRef} reduced={reduced} />

          <div className={`mt-4 grid gap-3 sm:gap-4 ${TILE_GRID[round.options.length] ?? TILE_GRID[4]}`}>
            {round.options.map((option, slot) => (
              <OptionTile
                key={option.char}
                option={option}
                hotkey={slot + 1}
                reduced={reduced}
                disabled={state.phase !== "playing"}
                state={tileState(state, round, option.char)}
                onPick={() => submit(option.char)}
              />
            ))}
          </div>

          <Reveal state={state} round={round} />
        </section>
      )}
    </GameShell>
  );
}

function tileState(state: GameState, round: ImposterRound, char: string): TileState {
  if (state.phase !== "reveal") return "idle";
  if (char === round.target.char) return "answer";
  if (char === state.picked) return "wrong";
  return "dimmed";
}

function Prompt({
  round,
  clockRef,
  barRef,
  reduced,
}: {
  round: ImposterRound;
  clockRef: RefObject<HTMLSpanElement | null>;
  barRef: RefObject<HTMLDivElement | null>;
  reduced: boolean;
}) {
  return (
    <div className="overflow-hidden rounded-3xl border border-line bg-card">
      <div className="texture-paper flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-5 py-5 sm:px-7 sm:py-6">
        <div>
          <p className="text-xs tracking-wider text-muted uppercase">
            Which one is
          </p>
          <p className="mt-1.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-3xl leading-none font-semibold text-seal sm:text-4xl">
              {round.target.pinyin}
            </span>
            <span className="text-base leading-snug sm:text-lg">
              {round.target.meaning}
            </span>
          </p>
        </div>
        <div className="text-right">
          <span
            ref={clockRef}
            className="font-mono text-2xl font-semibold tabular-nums"
            aria-hidden
          >
            {(round.limitMs / 1000).toFixed(1)}
          </span>
          <span className="ml-0.5 text-sm text-muted">s</span>
          {round.target.hsk ? (
            <div className="mt-1.5">
              <HskBadge level={round.target.hsk} />
            </div>
          ) : null}
        </div>
      </div>

      <div className="h-2 w-full bg-background-deep" role="presentation">
        <div
          ref={barRef}
          className={`h-full origin-left bg-gradient-to-r from-gold to-seal ${
            reduced ? "" : "will-change-transform"
          }`}
          style={{ transform: "scaleX(1)" }}
        />
      </div>
    </div>
  );
}

function Reveal({ state, round }: { state: GameState; round: ImposterRound }) {
  const revealing = state.phase === "reveal";
  const picked = state.picked ? describe(state.picked) : null;
  const wrong = revealing && !state.lastCorrect;

  return (
    <div className="mt-3 min-h-24" aria-live="polite">
      {!revealing ? (
        <p className="px-1 text-xs text-muted">
          Keys <Kbd>1</Kbd>–<Kbd>{round.options.length}</Kbd> pick a tile.
        </p>
      ) : (
        <div
          className={`rounded-2xl border px-4 py-4 sm:px-5 ${
            wrong ? "border-seal/45 bg-seal-soft" : "border-jade/40 bg-jade/10"
          }`}
        >
          <p className="text-sm font-semibold">
            {state.lastCorrect
              ? "Correct."
              : picked
                ? "Not that one."
                : "Time — that counts as a miss."}
          </p>

          {wrong ? (
            <div className="mt-3 flex flex-wrap items-stretch gap-3">
              {picked ? <Side label="You picked" option={picked} tone="text-seal" /> : null}
              <Side label="The answer" option={round.target} tone="text-jade" />
            </div>
          ) : null}

          <p className="mt-3 text-sm leading-relaxed text-muted">
            {/* On a timeout there is no pick to compare against, so fall back to
                the note the round was built with. */}
            {state.picked
              ? discriminator(round.group, round.target.char, state.picked)
              : round.note}
          </p>
        </div>
      )}
    </div>
  );
}

function Side({
  label,
  option,
  tone,
}: {
  label: string;
  option: ConfusableChar;
  tone: string;
}) {
  return (
    <div className="flex min-w-36 flex-1 items-center gap-2.5 rounded-xl border border-line bg-card px-2.5 py-2">
      <span className="font-hanzi text-3xl leading-none">{option.char}</span>
      <span className="min-w-0">
        <span className={`block text-[0.6rem] font-semibold tracking-wider uppercase ${tone}`}>
          {label}
        </span>
        <span className="block text-sm font-medium text-seal">{option.pinyin}</span>
        <span className="block text-xs leading-snug text-muted">{option.meaning}</span>
      </span>
    </div>
  );
}

function StartCard({ onStart }: { onStart: () => void }) {
  return (
    <section className="texture-paper rise-in rounded-3xl border border-line bg-card p-6 sm:p-10">
      <div className="max-w-2xl">
        <h2 className="text-2xl font-semibold tracking-tight">
          Read the sound, find the shape.
        </h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          You get a pinyin and a meaning — never the character. Two to four
          look-alikes appear; exactly one of them is the one you were asked for.
          The tiles multiply and the clock shortens as the run goes on. Three
          misses and it is over.
        </p>

        <ul className="mt-6 grid gap-2 text-sm sm:grid-cols-3">
          <Rule kbd={`${RUN_ROUNDS}`} text="rounds in a full run" />
          <Rule kbd={`${RUN_LIVES}`} text="misses end it early" />
          <Rule kbd="1–4" text="number keys pick a tile" />
        </ul>

        <div className="mt-8 flex flex-wrap items-center gap-3">
          <ActionButton onClick={onStart}>Start run</ActionButton>
          <span className="text-xs text-muted">
            or press <Kbd>Enter</Kbd>
          </span>
        </div>
      </div>
    </section>
  );
}

function Rule({ kbd, text }: { kbd: string; text: string }) {
  return (
    <li className="flex items-center gap-2.5 rounded-xl border border-line bg-card-soft px-3 py-2.5">
      <span className="font-mono text-sm font-semibold text-seal">{kbd}</span>
      <span className="text-xs leading-snug text-muted">{text}</span>
    </li>
  );
}
