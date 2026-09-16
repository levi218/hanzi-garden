"use client";

import Link from "next/link";

import { CRAFTABLE, entryFor } from "@/lib/alchemy";
import { HSK_LEVELS, LEVEL_STYLES, slugFor } from "@/lib/characters";

/**
 * The 444 craftable characters, split by HSK level. Built once at module load
 * so the collection grid never re-derives it on a re-render.
 */
const GROUPS = HSK_LEVELS.map((level) => ({
  level,
  chars: CRAFTABLE.filter((char) => entryFor(char)?.hsk === level),
}));

/**
 * The collection. Everything found is a link to its detail page; everything
 * still missing is a blank silhouette — the shape of the gap is motivating,
 * the answer written out in it would not be.
 */
export function DiscoveryLog({ discovered }: { discovered: Set<string> }) {
  const found = CRAFTABLE.filter((char) => discovered.has(char)).length;

  return (
    <section
      className="rounded-3xl border border-line bg-card p-5"
      aria-labelledby="alchemy-collection"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="alchemy-collection" className="text-lg font-semibold tracking-tight">
          Collection
        </h2>
        <p className="text-sm text-muted">
          <span className="font-semibold text-jade tabular-nums">{found}</span> of{" "}
          <span className="tabular-nums">{CRAFTABLE.length}</span> characters fused
        </p>
      </div>

      <div
        className="mt-4 max-h-[24rem] space-y-5 overflow-y-auto pr-1"
        tabIndex={0}
        role="region"
        aria-label="Discovered characters, scrollable"
      >
        {GROUPS.map((group) => {
          const groupFound = group.chars.filter((char) => discovered.has(char)).length;
          const style = LEVEL_STYLES[group.level];
          return (
            <div key={group.level}>
              <div className="sticky top-0 z-10 flex items-center gap-2 bg-card py-1 text-xs font-semibold tracking-wider uppercase">
                <span className={`size-1.5 rounded-full ${style.dot}`} aria-hidden />
                <span className={style.accent}>{style.label}</span>
                <span className="text-muted tabular-nums">
                  {groupFound} / {group.chars.length}
                </span>
              </div>
              <ul className="mt-2 grid grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-1.5">
                {group.chars.map((char) => {
                  const entry = entryFor(char);
                  if (!discovered.has(char)) {
                    return (
                      <li key={char}>
                        <span
                          className="grid aspect-square place-items-center rounded-lg border border-dashed border-line bg-card-soft/50 text-muted/35"
                          aria-hidden
                        >
                          <span className="size-1 rounded-full bg-current" />
                        </span>
                      </li>
                    );
                  }
                  return (
                    <li key={char}>
                      <Link
                        href={`/character/${slugFor(char)}`}
                        title={`${char} ${entry?.pinyin ?? ""} — ${entry?.meanings[0]?.def ?? ""}`}
                        aria-label={`${char}, ${entry?.pinyin ?? ""}, ${entry?.meanings[0]?.def ?? ""}`}
                        className="grid aspect-square place-items-center rounded-lg border border-line bg-card font-hanzi text-lg leading-none transition hover:-translate-y-0.5 hover:border-jade/50 hover:shadow-sm"
                      >
                        {char}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
