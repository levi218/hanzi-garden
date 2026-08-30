"use client";

import Link from "next/link";

import { GAME_LIST } from "@/lib/games";
import { charState, mastery, retention, useNow, useProgress } from "@/lib/progress";

const STATE_COPY: Record<
  ReturnType<typeof charState>,
  { label: string; note: string; tone: string; bar: string }
> = {
  unseen: {
    label: "Not practised yet",
    note: "Take it into a game and it starts being tracked.",
    tone: "text-muted",
    bar: "bg-line",
  },
  shaky: {
    label: "Shaky",
    note: "Met, but it has not stuck yet. Worth another pass soon.",
    tone: "text-seal",
    bar: "bg-seal",
  },
  held: {
    label: "Held",
    note: "You know this one right now. Revisit before it fades.",
    tone: "text-jade",
    bar: "bg-jade",
  },
  fading: {
    label: "Fading",
    note: "It has been a while — this is the kind you lose quietly.",
    tone: "text-gold",
    bar: "bg-gold",
  },
  mastered: {
    label: "Mastered",
    note: "Deep and still fresh. It will hold for weeks.",
    tone: "text-jade",
    bar: "bg-jade",
  },
};

/** This character's slice of the shared memory model, shown on its own page. */
export function CharacterMemory({ char }: { char: string }) {
  const progress = useProgress();
  const now = useNow();
  if (now === 0) {
    // Placeholder of the same height, so hydration does not shift the page.
    return <div className="mt-6 h-[4.5rem] rounded-2xl border border-line bg-card" />;
  }

  const stat = progress.chars[char];
  const state = charState(stat, now);
  const copy = STATE_COPY[state];
  const strength = mastery(stat, now);

  return (
    <div className="mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-4 rounded-2xl border border-line bg-card px-5 py-4">
      <div className="min-w-52 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <span className={`text-sm font-medium ${copy.tone}`}>{copy.label}</span>
          {stat?.seen ? (
            <span className="text-[0.7rem] text-muted tabular-nums">
              {stat.correct}/{stat.seen} correct ·{" "}
              {Math.round(retention(stat, now) * 100)}% fresh
            </span>
          ) : null}
        </div>
        <div
          className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-valuenow={Math.round(strength * 100)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`Memory strength for ${char}`}
        >
          <div
            className={`h-full rounded-full transition-[width] duration-500 ${copy.bar}`}
            style={{ width: `${Math.max(strength * 100, stat?.seen ? 4 : 0)}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-muted">{copy.note}</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {GAME_LIST.map((game) => (
          <Link
            key={game.id}
            href={game.href}
            className={`inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs transition hover:border-foreground/25 ${game.accent.text}`}
          >
            <span className="font-hanzi text-sm">{game.hanzi}</span>
            <span className="text-muted">{game.name}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
