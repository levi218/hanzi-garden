"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { ActionButton } from "@/components/games/GameShell";
import { HskBadge } from "@/components/HskBadge";
import { slugFor } from "@/lib/characters";
import { describe } from "@/lib/confusables";

/** One resolved round, as recorded by the game. */
export interface RunAnswer {
  target: string;
  /** null when the timer ran out. */
  picked: string | null;
  correct: boolean;
  ms: number;
  points: number;
}

export function RunSummary({
  answers,
  score,
  best,
  bestKnown,
  durationMs,
  onPlayAgain,
}: {
  answers: RunAnswer[];
  score: number;
  best: number;
  /** False until localStorage has been read, so the best never flashes "0". */
  bestKnown: boolean;
  durationMs: number;
  onPlayAgain: () => void;
}) {
  const correct = answers.filter((a) => a.correct);
  const accuracy = answers.length ? Math.round((correct.length / answers.length) * 100) : 0;
  const fastest = correct.reduce(
    (min, a) => (min === null || a.ms < min ? a.ms : min),
    null as number | null,
  );
  const misses = answers.filter((a) => !a.correct);
  const newBest = bestKnown && score >= best && score > 0;

  return (
    <section className="rise-in rounded-3xl border border-line bg-card p-6 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-xs tracking-wider text-muted uppercase">Run over</p>
          <p className="mt-1 text-5xl leading-none font-semibold tabular-nums">{score}</p>
        </div>
        {newBest ? (
          <span className="rounded-full bg-gold/15 px-3 py-1.5 text-xs font-semibold tracking-wide text-gold uppercase ring-1 ring-gold/30">
            New personal best
          </span>
        ) : bestKnown ? (
          <span className="text-sm text-muted">
            Personal best <span className="font-semibold tabular-nums">{best}</span>
          </span>
        ) : null}
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Figure label="Rounds" value={`${answers.length}`} />
        <Figure label="Accuracy" value={`${accuracy}%`} />
        <Figure
          label="Fastest"
          value={fastest === null ? "—" : `${(fastest / 1000).toFixed(2)}s`}
        />
        <Figure label="Time" value={`${Math.round(durationMs / 1000)}s`} />
      </dl>

      {misses.length > 0 ? (
        <div className="mt-8">
          <h2 className="text-sm font-semibold">
            What slipped past you
            <span className="ml-2 font-normal text-muted">
              — tap a character for the full breakdown
            </span>
          </h2>
          <ul className="mt-3 grid gap-2 sm:grid-cols-2">
            {misses.map((miss, index) => {
              const target = describe(miss.target);
              const picked = miss.picked ? describe(miss.picked) : null;
              return (
                <li key={`${miss.target}-${index}`}>
                  <Link
                    href={`/character/${slugFor(miss.target)}`}
                    className="flex items-center gap-3 rounded-2xl border border-line bg-card-soft px-3 py-2.5 transition hover:border-seal/40"
                  >
                    <span className="font-hanzi text-3xl leading-none">{target.char}</span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <span className="text-sm font-medium text-seal">
                          {target.pinyin}
                        </span>
                        {target.hsk ? <HskBadge level={target.hsk} /> : null}
                      </span>
                      <span className="mt-0.5 block truncate text-xs text-muted">
                        {picked ? (
                          <>
                            you picked{" "}
                            <span className="font-hanzi text-sm">{picked.char}</span>{" "}
                            {picked.pinyin}
                          </>
                        ) : (
                          "time ran out"
                        )}
                      </span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : (
        <p className="mt-8 rounded-2xl border border-jade/30 bg-jade/10 px-4 py-3 text-sm">
          Clean run — every imposter spotted.
        </p>
      )}

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <ActionButton onClick={onPlayAgain}>Play again</ActionButton>
        <span className="text-xs text-muted">
          or press <Kbd>Enter</Kbd>
        </span>
      </div>
    </section>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card-soft px-4 py-3">
      <dt className="text-[0.6rem] font-semibold tracking-wider text-muted uppercase">
        {label}
      </dt>
      <dd className="mt-1 text-2xl leading-none font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-card-soft px-1.5 py-0.5 font-mono text-[0.7rem] text-foreground">
      {children}
    </kbd>
  );
}
