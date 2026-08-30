"use client";

import {
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";

import { ActionButton, GameShell, PillGroup, StatChip } from "@/components/games/GameShell";
import {
  type AnswerResult,
  BattlePanel,
  type RunMode,
} from "@/components/games/territory/BattlePanel";
import { type CellView, HexMap, type TileFlash } from "@/components/games/territory/HexMap";
import {
  CampaignReport,
  Legend,
  ProvinceList,
  TileDetail,
  provinceRows,
} from "@/components/games/territory/MapAside";
import {
  type HskLevel,
  LEVEL_STYLES,
  byLevel,
  characters,
} from "@/lib/characters";
import { PLAYABLE_LEVELS } from "@/lib/games";
import {
  charState,
  mastery,
  recordAnswer,
  recordSession,
  reviewUrgency,
  summarizeLevel,
  useNow,
  useProgress,
} from "@/lib/progress";
import {
  type Question,
  STATE_META,
  difficultyFor,
  getLayout,
  makeQuestion,
  orderCampaign,
} from "@/lib/territory";

/** Questions per campaign run. Ten is one sitting, and one honest session score. */
const RUN_LENGTH = 10;

/* ------------------------------------------------------------------ *
 * "What slipped while you were away"
 *
 * A tiny store of its own: the shared progress state knows what you hold *now*,
 * but the reclaim message needs to know what you held last time you looked.
 * Read through useSyncExternalStore rather than an effect, so there is no
 * hydration flash and no setState-in-effect.
 * ------------------------------------------------------------------ */

const VISIT_KEY = "hanzi-garden.territory.visit.v1";
/** Reloading the page should not erase the news; only a real gap re-stamps it. */
const VISIT_MAX_AGE = 20 * 60_000;

interface Visit {
  at: number;
  held: string[];
}

let visitCache: Visit | null | undefined;

function readVisit(): Visit | null {
  if (visitCache !== undefined) return visitCache;
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(VISIT_KEY);
    const parsed = raw ? (JSON.parse(raw) as Partial<Visit>) : null;
    visitCache =
      parsed && Array.isArray(parsed.held)
        ? { at: Number(parsed.at) || 0, held: parsed.held.filter((c) => typeof c === "string") }
        : null;
  } catch {
    visitCache = null;
  }
  return visitCache;
}

function stampVisit(held: string[], at: number): void {
  const previous = readVisit();
  if (previous && at - previous.at < VISIT_MAX_AGE) return;
  visitCache = { at, held };
  try {
    window.localStorage.setItem(VISIT_KEY, JSON.stringify(visitCache));
  } catch {
    // Private mode: the map still works, it just cannot report reclaims.
  }
}

const NEVER_CHANGES = () => () => {};

function useLastVisit(): Visit | null {
  return useSyncExternalStore(NEVER_CHANGES, readVisit, () => null);
}

/**
 * Stable handler identity with an always-fresh body. The map memoizes hundreds
 * of tiles on prop identity; without this every answer would re-render all of
 * them just because a callback closed over newer state.
 */
function useEvent<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  const ref = useRef(fn);
  useEffect(() => {
    ref.current = fn;
  }, [fn]);
  return useCallback((...args: A) => ref.current(...args), []);
}

interface Run {
  mode: RunMode;
  /** Tile indices, in the order they will be attacked. */
  queue: number[];
  pos: number;
  /** Correct answers — the tiles that end the run in your hands. */
  won: number;
  /** Of those, the ones that were not yours before. */
  taken: number;
  startedAt: number;
}

interface RunReport {
  mode: RunMode;
  won: number;
  taken: number;
  total: number;
}

const LEVEL_OPTIONS = PLAYABLE_LEVELS.map((value) => ({
  value,
  label: value === "all" ? "All" : LEVEL_STYLES[value].label,
  dot: value === "all" ? undefined : LEVEL_STYLES[value].dot,
}));

export function TerritoryGame() {
  const progress = useProgress();
  const now = useNow();
  const ready = now > 0; // useNow returns 0 until the first client tick

  const [level, setLevel] = useState<HskLevel | "all">(1);
  const [run, setRun] = useState<Run | null>(null);
  const [question, setQuestion] = useState<Question | null>(null);
  const [result, setResult] = useState<AnswerResult | null>(null);
  const [askedAt, setAskedAt] = useState(0);
  const [report, setReport] = useState<RunReport | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [focusIndex, setFocusIndex] = useState(0);
  const [highlightProvince, setHighlightProvince] = useState<number | null>(null);
  const [flash, setFlash] = useState<{ index: number; tone: TileFlash } | null>(null);
  const [announce, setAnnounce] = useState("");

  const entries = useMemo(
    () => (level === "all" ? characters : byLevel(level)),
    [level],
  );
  const layout = useMemo(() => getLayout(`territory-${level}`, entries), [level, entries]);

  const cells: CellView[] = useMemo(
    () =>
      layout.tiles.map((tile) => {
        const stat = ready ? progress.chars[tile.char] : undefined;
        return {
          state: charState(stat, now),
          // Quantized: a fill string that barely moves keeps the memoized
          // tiles from re-rendering every time the clock ticks.
          mastery: Math.round(mastery(stat, now) * 4) / 4,
        };
      }),
    [layout, progress, now, ready],
  );

  const labels = useMemo(
    () =>
      layout.tiles.map((tile, i) => {
        const { entry } = tile;
        return `${entry.char}, ${entry.pinyin}, ${entry.meanings[0]?.def ?? ""}. ${
          STATE_META[cells[i].state].label
        }. Radical ${layout.provinces[tile.province].radical}.`;
      }),
    [layout, cells],
  );

  const heldChars = useMemo(() => {
    const set = new Set<string>();
    for (let i = 0; i < layout.tiles.length; i += 1) {
      const state = cells[i].state;
      if (state === "held" || state === "mastered") set.add(layout.tiles[i].char);
    }
    return set;
  }, [layout, cells]);

  /** Held / mastered / strength come from the same helper as the home dashboard. */
  const summary = useMemo(() => {
    const levels: HskLevel[] = level === "all" ? [1, 2, 3] : [level];
    return levels
      .map((one) => summarizeLevel(progress, characters, one, ready ? now : 0))
      .reduce(
        (acc, part) => ({
          total: acc.total + part.total,
          held: acc.held + (ready ? part.held : 0),
          mastered: acc.mastered + (ready ? part.mastered : 0),
          strength: acc.strength + (ready ? part.strength * part.total : 0),
        }),
        { total: 0, held: 0, mastered: 0, strength: 0 },
      );
  }, [progress, level, now, ready]);

  const atRisk = useMemo(
    () => cells.filter((cell) => cell.state === "fading").length,
    [cells],
  );

  const longestHeld = useMemo(() => {
    let char = "";
    let since = Infinity;
    for (let i = 0; i < layout.tiles.length; i += 1) {
      const state = cells[i].state;
      if (state !== "held" && state !== "mastered") continue;
      const stat = progress.chars[layout.tiles[i].char];
      if (!stat?.lastCorrect) continue;
      // The oldest reinforcement still standing: the hold that has lasted.
      if (stat.lastCorrect < since) {
        since = stat.lastCorrect;
        char = layout.tiles[i].char;
      }
    }
    return char ? { char, since } : null;
  }, [layout, cells, progress]);

  const provinces = useMemo(() => provinceRows(layout, cells), [layout, cells]);

  /* -------------------------------------------------------------- *
   * Reclaimed-since-last-visit
   * -------------------------------------------------------------- */

  const visit = useLastVisit();

  const slipped = useMemo(() => {
    if (!ready || !visit) return [];
    return visit.held.filter((char) => {
      const state = charState(progress.chars[char], now);
      return state === "fading" || state === "shaky";
    });
  }, [ready, visit, progress, now]);

  const slippedHere = useMemo(() => {
    const out: number[] = [];
    for (const char of slipped) {
      const index = layout.byChar.get(char);
      if (index !== undefined) out.push(index);
    }
    return out;
  }, [slipped, layout]);

  const heldEverywhere = useMemo(() => {
    if (!ready) return null;
    const out: string[] = [];
    for (const [char, stat] of Object.entries(progress.chars)) {
      const state = charState(stat, now);
      if (state === "held" || state === "mastered") out.push(char);
    }
    return out;
  }, [progress, now, ready]);

  useEffect(() => {
    if (!heldEverywhere) return;
    stampVisit(heldEverywhere, Date.now());
  }, [heldEverywhere]);

  /* -------------------------------------------------------------- *
   * Run control
   * -------------------------------------------------------------- */

  const openQuestion = useCallback(
    (index: number) => {
      const tile = layout.tiles[index];
      setQuestion(makeQuestion(tile.entry, entries, difficultyFor(cells[index].state)));
      setResult(null);
      setAskedAt(Date.now());
      setSelected(index);
      setFocusIndex(index);
      setHighlightProvince(tile.province);
    },
    [layout, entries, cells],
  );

  const beginRun = useEvent((mode: RunMode, only?: number[]) => {
    const startedAt = Date.now();
    const count = mode === "skirmish" ? 1 : Math.min(RUN_LENGTH, only?.length ?? RUN_LENGTH);
    const queue = orderCampaign({
      layout,
      urgency: (char) => reviewUrgency(progress.chars[char], startedAt),
      held: (char) => heldChars.has(char),
      count,
      only,
    }).map((tile) => tile.index);
    if (!queue.length) return;
    setReport(null);
    setRun({ mode, queue, pos: 0, won: 0, taken: 0, startedAt });
    openQuestion(queue[0]);
  });

  const finishRun = useCallback((finished: Run) => {
    // A one-tile raid is not a session; it would only inflate the play count.
    if (finished.mode !== "skirmish") {
      recordSession({
        game: "territory",
        score: finished.won,
        durationMs: Date.now() - finished.startedAt,
      });
      setReport({
        mode: finished.mode,
        won: finished.won,
        taken: finished.taken,
        total: finished.queue.length,
      });
    }
    setRun(null);
    setQuestion(null);
    setResult(null);
  }, []);

  const answer = useEvent((optionId: string) => {
    if (!question || result) return;
    const index = layout.byChar.get(question.char);
    if (index === undefined) return;
    const before = cells[index].state;
    const correct = optionId === question.answerId;
    const conquered = correct && before !== "held" && before !== "mastered";

    recordAnswer({
      char: question.char,
      correct,
      game: "territory",
      ms: Date.now() - askedAt,
    });

    setResult({ optionId, correct, conquered, before });
    setFlash({ index, tone: correct ? "win" : "loss" });
    setAnnounce(
      correct
        ? `Correct. ${question.char} ${conquered ? "taken" : "held"}.`
        : `Wrong. ${question.char} is ${
            question.options.find((option) => option.id === question.answerId)?.text ?? ""
          }.`,
    );
    if (run) {
      setRun({
        ...run,
        won: run.won + (correct ? 1 : 0),
        taken: run.taken + (conquered ? 1 : 0),
      });
    }
  });

  const advance = useEvent(() => {
    if (!run) {
      setQuestion(null);
      setResult(null);
      return;
    }
    const pos = run.pos + 1;
    if (pos >= run.queue.length) {
      finishRun(run);
      return;
    }
    setRun({ ...run, pos });
    openQuestion(run.queue[pos]);
  });

  const quit = useEvent(() => {
    if (run && (run.pos > 0 || result)) finishRun(run);
    else {
      setRun(null);
      setQuestion(null);
      setResult(null);
    }
  });

  /* -------------------------------------------------------------- *
   * Map handlers — all stable, so the tiles stay memoized
   * -------------------------------------------------------------- */

  const activate = useEvent((index: number) => {
    // Mid-campaign a click is an inspection, not a new attack: the queue is the
    // run. A one-off raid, though, can simply be redirected at another tile.
    if (run && run.mode !== "skirmish") {
      setSelected(index);
      setHighlightProvince(layout.tiles[index].province);
      return;
    }
    beginRun("skirmish", [index]);
  });

  const focusTile = useEvent((index: number) => {
    setFocusIndex(index);
    setSelected(index);
    setHighlightProvince(layout.tiles[index].province);
  });

  const hoverTile = useEvent((index: number | null) => setHover(index));

  const pickProvince = useEvent((index: number) => {
    setHighlightProvince(index);
    const first = layout.provinces[index].tiles[0];
    if (first !== undefined) {
      setSelected(first);
      setFocusIndex(first);
    }
  });

  const changeLevel = useEvent((next: HskLevel | "all") => {
    setLevel(next);
    // Any open question belongs to the old map; drop it rather than let it
    // point at a character the new layout does not contain.
    setRun(null);
    setQuestion(null);
    setResult(null);
    setSelected(null);
    setHover(null);
    setFocusIndex(0);
    setHighlightProvince(null);
    setReport(null);
  });

  /* -------------------------------------------------------------- *
   * Keyboard: number keys answer, Enter advances
   * -------------------------------------------------------------- */

  useEffect(() => {
    if (!question) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      // Buttons and links handle their own Enter; do not double-fire.
      const onControl = Boolean(target?.closest?.("button, a"));
      if (event.key === "Enter") {
        if (result && !onControl) {
          event.preventDefault();
          advance();
        }
        return;
      }
      const choice = Number(event.key);
      if (!result && Number.isInteger(choice) && choice >= 1 && choice <= question.options.length) {
        event.preventDefault();
        answer(question.options[choice - 1].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [question, result, advance, answer]);

  useEffect(() => {
    if (!flash) return;
    const timer = window.setTimeout(() => setFlash(null), 900);
    return () => window.clearTimeout(timer);
  }, [flash]);

  /* -------------------------------------------------------------- *
   * Render
   * -------------------------------------------------------------- */

  // A one-tile raid is not a campaign: it should not lock the level picker.
  const campaigning = Boolean(run && run.mode !== "skirmish");
  const detailIndex = hover ?? selected ?? Math.min(focusIndex, layout.tiles.length - 1);
  const detailTile = layout.tiles[detailIndex];
  const activeTile = question ? layout.byChar.get(question.char) : undefined;
  const conquered = summary.total ? Math.round((summary.held / summary.total) * 100) : 0;

  const upcoming = useMemo(() => {
    if (!run) return [];
    return run.queue.slice(run.pos + 1, run.pos + 6).map((index) => ({
      char: layout.tiles[index].char,
      state: cells[index].state,
      mastery: cells[index].mastery,
    }));
  }, [run, layout, cells]);

  return (
    <GameShell
      game="territory"
      stats={
        <>
          <StatChip label="Held" value={ready ? summary.held : "—"} tone="text-jade" />
          <StatChip label="Map" value={ready ? `${conquered}%` : "—"} />
          <StatChip label="Fortified" value={ready ? summary.mastered : "—"} />
          <StatChip
            label="At risk"
            value={ready ? atRisk : "—"}
            tone={atRisk ? "text-gold" : ""}
          />
        </>
      }
      controls={
        <div className="flex flex-wrap items-center gap-3">
          <PillGroup
            label="HSK level"
            options={LEVEL_OPTIONS}
            value={level}
            onChange={changeLevel}
            disabled={campaigning}
          />
          <ActionButton onClick={() => beginRun("campaign")} disabled={campaigning}>
            {report ? "New campaign" : "Start campaign"}
            <span className="text-xs opacity-70">{RUN_LENGTH} tiles</span>
          </ActionButton>
          {slippedHere.length > 0 && !campaigning ? (
            <ActionButton variant="ghost" onClick={() => beginRun("defend", slippedHere)}>
              Defend {slippedHere.length}
            </ActionButton>
          ) : null}
        </div>
      }
      footer={
        <div className="rounded-2xl border border-line bg-card-soft p-5 text-sm leading-relaxed text-muted">
          <h2 className="text-xs font-semibold tracking-wider text-foreground uppercase">
            How the map works
          </h2>
          <p className="mt-2">
            Every character in the level is one hex, and neighbouring hexes share a
            radical — each province is one radical, laid out from its simplest
            character outward. Answer correctly and the tile turns to your colour;
            leave it alone and the memory decays until the tile fades back to
            neutral. A campaign hands you ten tiles chosen by what is closest to
            slipping, nudged toward land that borders territory you already hold.
          </p>
          <p className="mt-2">
            Keyboard: <Key>Tab</Key> into the map, <Key>←</Key> <Key>→</Key>{" "}
            <Key>↑</Key> <Key>↓</Key> to move between neighbouring tiles,{" "}
            <Key>Enter</Key> to attack. During a question, <Key>1</Key>–<Key>5</Key>{" "}
            answer and <Key>Enter</Key> moves on.
          </p>
        </div>
      }
    >
      <div data-territory className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_21rem]">
        <style>{MAP_CSS}</style>

        <p aria-live="polite" className="sr-only">
          {announce}
        </p>

        <div className="lg:col-start-1 lg:row-start-1">
          {slipped.length > 0 ? (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-gold/40 bg-gold/10 px-4 py-3">
              <p className="text-sm">
                <span className="font-medium text-gold">
                  {slipped.length} {slipped.length === 1 ? "tile" : "tiles"} slipped
                </span>{" "}
                back while you were away.
                {slippedHere.length === 0 ? (
                  <span className="text-muted"> None of them are in this level.</span>
                ) : null}
              </p>
              {slippedHere.length > 0 && !campaigning ? (
                <button
                  type="button"
                  onClick={() => beginRun("defend", slippedHere)}
                  className="rounded-full border border-gold/50 px-3 py-1.5 text-xs font-medium text-gold transition hover:bg-gold/15"
                >
                  Defend {slippedHere.length} here
                </button>
              ) : null}
            </div>
          ) : null}

          {report ? (
            <div className="rise-in mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-card px-4 py-3">
              <p className="text-sm">
                {report.mode === "defend" ? "Defence" : "Campaign"} over —{" "}
                <span className="font-medium text-jade">
                  {report.won} of {report.total}
                </span>{" "}
                held
                {report.taken > 0 ? `, ${report.taken} newly taken` : ""}.
              </p>
              <button
                type="button"
                onClick={() => beginRun(report.mode === "defend" ? "campaign" : report.mode)}
                className="text-xs font-medium text-muted underline decoration-dotted underline-offset-4 transition hover:text-foreground"
              >
                Go again
              </button>
            </div>
          ) : null}

          <HexMap
            key={layout.key}
            layout={layout}
            cells={cells}
            labels={labels}
            selected={activeTile ?? selected}
            focus={Math.min(focusIndex, layout.tiles.length - 1)}
            flashIndex={flash?.index ?? null}
            flash={flash?.tone ?? null}
            highlightProvince={highlightProvince}
            onActivate={activate}
            onFocusTile={focusTile}
            onHover={hoverTile}
          />
          <p className="mt-2 text-xs text-muted">
            Drag to pan, scroll or pinch to zoom, FIT to reset. Click a tile to raid
            it on its own.
          </p>
        </div>

        <div className="grid content-start gap-4 lg:col-start-2 lg:row-start-1">
          {question ? (
            <BattlePanel
              question={question}
              entry={layout.tiles[layout.byChar.get(question.char) ?? 0].entry}
              mode={run?.mode ?? "skirmish"}
              position={(run?.pos ?? 0) + 1}
              total={run?.queue.length ?? 1}
              result={result}
              upcoming={upcoming}
              onAnswer={answer}
              onNext={advance}
              onQuit={quit}
            />
          ) : detailTile ? (
            <TileDetail
              entry={detailTile.entry}
              state={cells[detailIndex].state}
              stat={progress.chars[detailTile.char]}
              province={layout.provinces[detailTile.province].radical}
              now={now}
            />
          ) : null}

          <CampaignReport
            total={summary.total}
            held={summary.held}
            mastered={summary.mastered}
            atRisk={atRisk}
            strength={summary.total ? summary.strength / summary.total : 0}
            longestHeld={ready ? longestHeld : null}
            now={now}
          />

          <ProvinceList
            rows={provinces}
            highlight={highlightProvince}
            onPick={pickProvince}
          />

          <Legend />
        </div>
      </div>
    </GameShell>
  );
}

function Key({ children }: { children: ReactNode }) {
  return (
    <kbd className="rounded border border-line bg-card px-1.5 py-0.5 text-[0.7rem] text-foreground">
      {children}
    </kbd>
  );
}

/** Scoped to `[data-territory]`. `--indigo` is this game's accent, defined for
 * both themes in `app/globals.css` alongside the other accents. */
const MAP_CSS = `
[data-territory] .terr-tile { cursor: pointer; }
[data-territory] .terr-tile polygon,
[data-territory] .terr-tile text { transition: fill 480ms ease, stroke 480ms ease; }
[data-territory] .terr-tile:focus { outline: none; }
[data-territory] .terr-tile:focus-visible > polygon:first-of-type {
  stroke: var(--indigo);
  stroke-width: 1.7;
}
[data-territory] .terr-flash { animation: terrFlash 900ms ease-out forwards; }
@keyframes terrFlash { from { opacity: 1; } to { opacity: 0; } }
@media (prefers-reduced-motion: reduce) {
  [data-territory] .terr-tile polygon,
  [data-territory] .terr-tile text { transition: none; }
  [data-territory] .terr-flash { animation: none; opacity: 0; }
}
`;
