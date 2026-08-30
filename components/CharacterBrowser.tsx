"use client";

import { useEffect, useMemo, useRef, useState } from "react";

import { CharacterCard } from "@/components/CharacterCard";
import {
  HSK_LEVELS,
  LEVEL_STYLES,
  plainText,
  type CharacterCardData,
  type HskLevel,
} from "@/lib/characters";

type Filter = "all" | HskLevel;

export function CharacterBrowser({ cards }: { cards: CharacterCardData[] }) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  // Press "/" anywhere to jump to the search box.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      event.preventDefault();
      inputRef.current?.focus();
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const counts = useMemo(() => {
    const tally: Record<HskLevel, number> = { 1: 0, 2: 0, 3: 0 };
    for (const card of cards) tally[card.hsk] += 1;
    return tally;
  }, [cards]);

  const results = useMemo(() => {
    const needle = plainText(query);
    const result = cards.filter((card) => {
      if (filter !== "all" && card.hsk !== filter) return false;
      if (!needle) return true;
      return card.haystack.includes(needle);
    });
    return result;
  }, [cards, filter, query]);

  const tabs: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: "All", count: cards.length },
    ...HSK_LEVELS.map((level) => ({
      value: level as Filter,
      label: LEVEL_STYLES[level].label,
      count: counts[level],
    })),
  ];

  return (
    <section id="browse" className="scroll-mt-20">
      <div className="sticky top-14 z-20 -mx-4 mb-8 border-b border-line/70 bg-background/85 px-4 py-4 backdrop-blur-md sm:-mx-6 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div
            className="flex flex-wrap gap-1.5 rounded-full border border-line bg-card-soft p-1"
            role="group"
            aria-label="Filter by HSK level"
          >
            {tabs.map((tab) => {
              const active = tab.value === filter;
              const dot =
                tab.value === "all"
                  ? "bg-seal"
                  : LEVEL_STYLES[tab.value as HskLevel].dot;
              return (
                <button
                  key={String(tab.value)}
                  type="button"
                  onClick={() => { setFilter(tab.value); }}
                  aria-pressed={active}
                  className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-medium transition ${
                    active
                      ? "bg-card text-foreground shadow-sm ring-1 ring-line"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <span className={`size-1.5 rounded-full ${dot}`} aria-hidden />
                  {tab.label}
                  <span className="text-xs tabular-nums opacity-60">
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="relative sm:w-72">
            <label htmlFor="character-search" className="sr-only">
              Search characters, pinyin or meaning
            </label>
            <svg
              viewBox="0 0 20 20"
              fill="none"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
              aria-hidden
            >
              <circle cx="9" cy="9" r="6" stroke="currentColor" strokeWidth="1.6" />
              <path
                d="m13.5 13.5 3.5 3.5"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
              />
            </svg>
            <input
              id="character-search"
              ref={inputRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search hanzi, pinyin or meaning"
              autoComplete="off"
              className="w-full rounded-full border border-line bg-card py-2 pr-10 pl-9 text-sm placeholder:text-muted/70 focus:border-seal/50 focus:outline-none"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-full px-1.5 py-0.5 text-xs text-muted transition hover:text-foreground"
                aria-label="Clear search"
              >
                clear
              </button>
            ) : (
              <kbd className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 rounded border border-line px-1.5 py-0.5 font-mono text-[0.65rem] text-muted">
                /
              </kbd>
            )}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl">
        <p className="mb-4 text-xs tracking-wide text-muted uppercase">
          {results.length} {results.length === 1 ? "character" : "characters"}
          {query ? ` matching “${query.trim()}”` : ""}
        </p>

        {results.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6">
            {results.map((card) => (
              <CharacterCard key={card.slug} card={card} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-line bg-card/60 px-6 py-16 text-center">
            <p className="font-hanzi text-5xl opacity-30">空</p>
            <p className="mt-4 font-medium">Nothing here yet</p>
            <p className="mt-1 text-sm text-muted">
              No character matches that search. Try a meaning like “water”, a
              pinyin like “hao”, or the hanzi itself.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
