"use client";

import Link from "next/link";
import { useMemo } from "react";

import { ActivityHeatmap } from "@/components/progress/ActivityHeatmap";
import { MasteryRing } from "@/components/progress/MasteryRing";
import { Sparkline } from "@/components/progress/Sparkline";
import {
  HSK_LEVELS,
  LEVEL_STYLES,
  characters,
  slugFor,
  type HskLevel,
} from "@/lib/characters";
import { GAME_LIST } from "@/lib/games";
import {
  activityWindow,
  charState,
  currentStreak,
  dayKey,
  resetProgress,
  reviewUrgency,
  summarizeLevel,
  totals,
  useNow,
  useProgress,
} from "@/lib/progress";

const LEVEL_COLORS: Record<HskLevel, string> = {
  1: "var(--jade)",
  2: "var(--gold)",
  3: "var(--seal)",
};

function formatWhen(timestamp: number, now: number): string {
  if (!timestamp) return "never";
  const minutes = Math.round((now - timestamp) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

/**
 * The home-page (and /progress) readout. Everything here is derived from the
 * one localStorage store the games write to, so the four games and this panel
 * can never disagree about how well a character is known.
 */
export function ProgressDashboard({
  variant = "home",
}: {
  variant?: "home" | "full";
}) {
  const progress = useProgress();
  // `useNow` is 0 until the client has hydrated, so the server markup and the
  // first client paint agree; after that it ticks once a minute so decay is
  // visible without recomputing the summary on every render.
  const now = useNow();
  const ready = now > 0;

  const summary = useMemo(() => {
    if (!ready) return null;
    const overall = totals(progress, now);
    const levels = HSK_LEVELS.map((level) =>
      summarizeLevel(progress, characters, level, now),
    );
    const today = progress.days[dayKey(now)] ?? { answers: 0, correct: 0, ms: 0 };
    const recent = activityWindow(progress, 30, now).map((day) => day.stat.answers);
    const fading = characters
      .filter((entry) => charState(progress.chars[entry.char], now) === "fading")
      .sort(
        (a, b) =>
          reviewUrgency(progress.chars[b.char], now) -
          reviewUrgency(progress.chars[a.char], now),
      );
    return {
      overall,
      levels,
      today,
      recent,
      fading,
      streak: currentStreak(progress, now),
    };
  }, [progress, now, ready]);

  const started = ready && summary !== null && summary.overall.answers > 0;

  return (
    <section
      id="progress"
      className="scroll-mt-20"
      aria-label="Your learning progress"
    >
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
            <span className="font-hanzi">进度</span>{" "}
            <span className="text-muted">— your garden</span>
          </h2>
          <p className="mt-1 text-sm text-muted">
            {started
              ? "Every game feeds the same memory. Characters fade if you leave them alone."
              : "Play anything below and this fills in. Nothing leaves your browser."}
          </p>
        </div>
        {variant === "home" ? (
          <Link
            href="/progress"
            className="text-sm text-muted underline underline-offset-4 transition hover:text-foreground"
          >
            Full breakdown
          </Link>
        ) : null}
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile
          label="Day streak"
          value={summary ? summary.streak : "—"}
          note={
            summary?.today.answers
              ? `${summary.today.answers} today`
              : "answer one thing today"
          }
          accent="text-seal"
        />
        <Tile
          label="Characters held"
          value={summary ? summary.overall.charsHeld : "—"}
          note={`of ${characters.length}`}
          accent="text-jade"
        />
        <Tile
          label="Mastered"
          value={summary ? summary.overall.charsMastered : "—"}
          note="deep and fresh"
          accent="text-gold"
        />
        <Tile
          label="Accuracy"
          value={
            summary && summary.overall.answers
              ? `${Math.round(summary.overall.accuracy * 100)}%`
              : "—"
          }
          note={
            summary?.overall.answers
              ? `${summary.overall.answers} answers`
              : "no answers yet"
          }
        >
          {summary && summary.overall.answers ? (
            <Sparkline
              values={summary.recent}
              className="mt-2 h-6 w-full text-jade"
            />
          ) : null}
        </Tile>
      </div>

      {/* Level rings + activity */}
      <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)]">
        <div className="rounded-2xl border border-line bg-card px-5 py-5">
          <h3 className="text-xs font-semibold tracking-wider text-muted uppercase">
            By HSK level
          </h3>
          <div className="mt-4 flex flex-wrap justify-around gap-4">
            {HSK_LEVELS.map((level) => {
              const stat = summary?.levels.find((l) => l.level === level);
              const style = LEVEL_STYLES[level];
              return (
                <div key={level} className="flex flex-col items-center gap-2">
                  <MasteryRing
                    color={LEVEL_COLORS[level]}
                    strength={stat?.strength ?? 0}
                    coverage={stat ? stat.touched / Math.max(1, stat.total) : 0}
                    label={stat ? `${stat.held}` : "—"}
                    sublabel={stat ? `of ${stat.total}` : undefined}
                  />
                  <span
                    className={`flex items-center gap-1.5 text-[0.65rem] font-semibold tracking-wider uppercase ${style.accent}`}
                  >
                    <span className={`size-1.5 rounded-full ${style.dot}`} aria-hidden />
                    {style.label}
                  </span>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-center text-[0.7rem] leading-relaxed text-muted">
            Outer ring: characters you have met. Inner ring: how much is still
            fresh today.
          </p>
        </div>

        <div className="rounded-2xl border border-line bg-card px-5 py-5">
          <h3 className="text-xs font-semibold tracking-wider text-muted uppercase">
            Activity
          </h3>
          <div className="mt-4">
            {summary ? (
              <ActivityHeatmap progress={progress} now={now} weeks={18} />
            ) : (
              <div className="h-24 animate-pulse rounded-xl bg-card-soft" />
            )}
          </div>
        </div>
      </div>

      {/* Per-game scoreboard */}
      <h3 className="mt-8 mb-3 text-xs font-semibold tracking-wider text-muted uppercase">
        Games
      </h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {GAME_LIST.map((game) => {
          const stat = progress.games[game.id];
          return (
            <Link
              key={game.id}
              href={game.href}
              className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-card px-5 py-4 transition hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5"
            >
              <span
                className={`pointer-events-none absolute inset-x-0 -top-16 h-24 bg-gradient-to-b ${game.accent.gradient} to-transparent opacity-0 blur-xl transition-opacity group-hover:opacity-100`}
                aria-hidden
              />
              <div className="relative flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium">{game.name}</div>
                  <div className="mt-0.5 text-[0.7rem] text-muted">
                    {game.tagline}
                  </div>
                </div>
                <span
                  className={`grid size-9 shrink-0 place-items-center rounded-xl font-hanzi text-[0.7rem] leading-tight ring-1 ${game.accent.soft} ${game.accent.ring} ${game.accent.text}`}
                  aria-hidden
                >
                  {game.hanzi}
                </span>
              </div>
              <div className="relative mt-4 flex items-end justify-between gap-2">
                <div>
                  <div className="text-2xl leading-none font-semibold tabular-nums">
                    {ready ? stat.best : "—"}
                  </div>
                  <div className="text-[0.6rem] tracking-wider text-muted uppercase">
                    {game.scoreLabel}
                  </div>
                </div>
                <div className="text-right text-[0.65rem] text-muted">
                  {ready && stat.plays ? (
                    <>
                      <div>
                        {stat.plays} {stat.plays === 1 ? "run" : "runs"}
                      </div>
                      <div>{formatWhen(stat.lastPlayed, now)}</div>
                    </>
                  ) : (
                    <div className={game.accent.text}>Not played yet</div>
                  )}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      {/* Review debt */}
      {summary && summary.fading.length > 0 ? (
        <div className="mt-8 rounded-2xl border border-line bg-card px-5 py-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-xs font-semibold tracking-wider text-muted uppercase">
              Slipping away
              <span className="ml-2 rounded-full bg-seal-soft px-2 py-0.5 text-[0.65rem] text-seal">
                {summary.fading.length}
              </span>
            </h3>
            <Link
              href="/games/territory"
              className="text-xs text-muted underline underline-offset-4 transition hover:text-foreground"
            >
              Defend them on the map
            </Link>
          </div>
          <ul className="mt-4 flex flex-wrap gap-2">
            {summary.fading.slice(0, variant === "full" ? 60 : 20).map((entry) => (
              <li key={entry.char}>
                <Link
                  href={`/character/${slugFor(entry.char)}`}
                  title={`${entry.pinyin} — ${entry.meanings[0]?.def ?? ""}`}
                  className="grid size-11 place-items-center rounded-xl border border-dashed border-line bg-card-soft font-hanzi text-xl transition hover:border-seal/50 hover:text-seal"
                >
                  {entry.char}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {variant === "full" && started ? (
        <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-dashed border-line px-5 py-4 text-sm">
          <p className="text-muted">
            {summary?.overall.minutes ?? 0} minutes studied ·{" "}
            {summary?.overall.charsTouched ?? 0} characters met. All of it lives in
            this browser only.
          </p>
          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  "Erase all progress — streak, scores, discoveries and territory? This cannot be undone.",
                )
              ) {
                resetProgress();
              }
            }}
            className="rounded-full border border-line px-4 py-2 text-xs text-muted transition hover:border-seal/50 hover:text-seal"
          >
            Reset everything
          </button>
        </div>
      ) : null}
    </section>
  );
}

function Tile({
  label,
  value,
  note,
  accent = "",
  children,
}: {
  label: string;
  value: React.ReactNode;
  note?: string;
  accent?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-line bg-card px-4 py-4">
      <div className="text-[0.6rem] font-semibold tracking-wider text-muted uppercase">
        {label}
      </div>
      <div className={`mt-1.5 text-3xl leading-none font-semibold tabular-nums ${accent}`}>
        {value}
      </div>
      {note ? <div className="mt-1.5 text-[0.7rem] text-muted">{note}</div> : null}
      {children}
    </div>
  );
}
