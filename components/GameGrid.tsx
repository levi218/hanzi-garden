"use client";

import Link from "next/link";

import { GAME_LIST } from "@/lib/games";
import { useNow, useProgress } from "@/lib/progress";

/** Sample tiles shown inside each card so a game is recognisable before you open it. */
const PREVIEWS: Record<string, string[]> = {
  alchemy: ["女", "子", "好"],
  imposter: ["未", "末", "术"],
  rhythm: ["一", "丨", "丿"],
  territory: ["日", "月", "明"],
};

export function GameGrid() {
  const progress = useProgress();
  const now = useNow();
  const ready = now > 0;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {GAME_LIST.map((game) => {
        const stat = progress.games[game.id];
        return (
          <Link
            key={game.id}
            href={game.href}
            className="group relative flex flex-col overflow-hidden rounded-3xl border border-line bg-card p-6 transition duration-200 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/5"
          >
            <span
              className={`pointer-events-none absolute inset-x-0 -top-24 h-40 bg-gradient-to-b ${game.accent.gradient} to-transparent opacity-0 blur-2xl transition-opacity duration-300 group-hover:opacity-100`}
              aria-hidden
            />

            <div className="relative flex items-start gap-4">
              <span
                className={`grid size-12 shrink-0 place-items-center rounded-2xl font-hanzi text-base leading-tight ring-1 ${game.accent.soft} ${game.accent.ring} ${game.accent.text}`}
                aria-hidden
              >
                {game.hanzi}
              </span>
              <div className="min-w-0">
                <h3 className="text-xl font-semibold tracking-tight">{game.name}</h3>
                <p className={`mt-0.5 text-sm ${game.accent.text}`}>{game.tagline}</p>
              </div>
            </div>

            <p className="relative mt-4 flex-1 text-sm leading-relaxed text-muted">
              {game.blurb}
            </p>

            <div className="relative mt-5 flex items-end justify-between gap-4">
              <div className="flex items-center gap-1.5" aria-hidden>
                {PREVIEWS[game.id]?.map((char, index) => (
                  <span
                    key={`${char}-${index}`}
                    className="grid size-10 place-items-center rounded-xl border border-line bg-card-soft font-hanzi text-lg transition group-hover:border-foreground/15"
                  >
                    {char}
                  </span>
                ))}
              </div>

              <div className="text-right">
                {ready && stat.plays ? (
                  <>
                    <div className="text-2xl leading-none font-semibold tabular-nums">
                      {stat.best}
                    </div>
                    <div className="text-[0.6rem] tracking-wider text-muted uppercase">
                      best {game.scoreLabel}
                    </div>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-muted transition group-hover:border-foreground/25 group-hover:text-foreground">
                    Play
                    <span aria-hidden>&rarr;</span>
                  </span>
                )}
              </div>
            </div>
          </Link>
        );
      })}
    </div>
  );
}
