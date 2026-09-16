"use client";

import Link from "next/link";

import { HskBadge } from "@/components/HskBadge";
import { slugFor } from "@/lib/characters";
import { type CharStat, type CharState, retention } from "@/lib/progress";
import {
  STATE_META,
  STATE_ORDER,
  type TerritoryLayout,
  fadingAt,
  relativeTime,
  tileFill,
  tileStroke,
} from "@/lib/territory";
import type { CellView } from "@/components/games/territory/HexMap";
import type { CharacterEntry } from "@/lib/types";

/** A little hex swatch, so the legend uses the map's own shapes. */
function Swatch({ state, mastery }: { state: CharState; mastery: number }) {
  return (
    <svg viewBox="-11 -11 22 22" className="size-5 shrink-0" aria-hidden>
      <polygon
        points="8.66,-5 8.66,5 0,10 -8.66,5 -8.66,-5 0,-10"
        fill={tileFill(state, mastery)}
        stroke={tileStroke(state)}
        strokeWidth={1}
      />
      {state === "mastered" ? (
        <polygon
          points="5.89,-3.4 5.89,3.4 0,6.8 -5.89,3.4 -5.89,-3.4 0,-6.8"
          fill="none"
          stroke="var(--gold)"
          strokeWidth={1}
        />
      ) : null}
    </svg>
  );
}

/**
 * The colour code, spelled out. The whole board is a colour code, so this is
 * not optional decoration.
 */
export function Legend() {
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="text-[0.65rem] font-semibold tracking-wider text-muted uppercase">
        Map legend
      </h2>
      <dl className="mt-3 grid gap-2.5">
        {STATE_ORDER.map((state) => (
          <div key={state} className="flex items-start gap-2.5">
            <Swatch state={state} mastery={STATE_META[state].sample} />
            <div className="min-w-0">
              <dt className="text-sm leading-tight font-medium">
                {STATE_META[state].label}
              </dt>
              <dd className="text-xs leading-snug text-muted">
                {STATE_META[state].blurb}
              </dd>
            </div>
          </div>
        ))}
      </dl>
      <p className="mt-3 border-t border-line pt-3 text-xs leading-relaxed text-muted">
        Colour depth follows how strong the memory is; the gold inner ring marks a
        fortress. Thin ink lines are province borders — every province is one
        radical.
      </p>
    </section>
  );
}

/** Hover / focus readout for a single tile. */
export function TileDetail({
  entry,
  state,
  stat,
  province,
  now,
}: {
  entry: CharacterEntry;
  state: CharState;
  stat: CharStat | undefined;
  province: string;
  now: number;
}) {
  const fades =
    stat && stat.lastCorrect
      ? fadingAt(stat.lastCorrect, (at) => retention(stat, at))
      : null;

  return (
    <section className="rounded-2xl border border-line bg-card p-4" aria-live="off">
      <div className="flex items-start gap-3">
        <Link
          href={`/character/${slugFor(entry.char)}`}
          className="grid size-16 shrink-0 place-items-center rounded-xl border border-line bg-card-soft font-hanzi text-4xl leading-none transition hover:border-foreground/30"
        >
          {entry.char}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold text-seal">{entry.pinyin}</span>
            <HskBadge level={entry.hsk} />
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-snug text-muted">
            {entry.meanings.map((m) => m.def).join("; ")}
          </p>
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs">
        <div>
          <dt className="text-muted">Status</dt>
          <dd className="mt-0.5 flex items-center gap-1.5 font-medium">
            <Swatch state={state} mastery={0.7} />
            {STATE_META[state].label}
          </dd>
        </div>
        <div>
          <dt className="text-muted">Province</dt>
          <dd className="mt-0.5 font-medium">
            <span className="font-hanzi text-base">{province}</span> radical
          </dd>
        </div>
        <div>
          <dt className="text-muted">Attacks</dt>
          <dd className="mt-0.5 font-medium tabular-nums">
            {stat ? `${stat.correct} won · ${stat.wrong} lost` : "never attacked"}
          </dd>
        </div>
        <div>
          <dt className="text-muted">{fades && fades > now ? "Fades" : "Faded"}</dt>
          <dd className="mt-0.5 font-medium">
            {fades && now ? relativeTime(fades, now) : "—"}
          </dd>
        </div>
      </dl>
    </section>
  );
}

export interface ProvinceRow {
  index: number;
  radical: string;
  size: number;
  held: number;
}

/**
 * Provinces are the medium-term goal: a radical you hold end to end. Sorted by
 * how close each one is to falling, so the list doubles as a to-do.
 */
export function ProvinceList({
  rows,
  highlight,
  onPick,
}: {
  rows: ProvinceRow[];
  highlight: number | null;
  onPick: (index: number) => void;
}) {
  const secured = rows.filter((row) => row.held === row.size).length;
  const shown = rows
    .filter((row) => row.size > 1)
    .sort((a, b) => b.held / b.size - a.held / a.size || b.size - a.size)
    .slice(0, 10);

  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-[0.65rem] font-semibold tracking-wider text-muted uppercase">
          Provinces
        </h2>
        <span className="text-xs text-muted tabular-nums">
          {secured} / {rows.length} secured
        </span>
      </div>
      <ul className="mt-3 grid gap-1">
        {shown.map((row) => {
          const complete = row.held === row.size;
          return (
            <li key={row.index}>
              <button
                type="button"
                onClick={() => onPick(row.index)}
                aria-pressed={highlight === row.index}
                className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition ${
                  highlight === row.index ? "bg-card-soft" : "hover:bg-card-soft"
                }`}
              >
                <span className="font-hanzi text-lg leading-none">{row.radical}</span>
                <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-line">
                  <span
                    className="block h-full rounded-full bg-jade transition-[width] duration-500"
                    style={{ width: `${(row.held / row.size) * 100}%` }}
                  />
                </span>
                <span
                  className={`w-12 shrink-0 text-right text-xs tabular-nums ${
                    complete ? "text-jade" : "text-muted"
                  }`}
                >
                  {complete ? "secured" : `${row.held}/${row.size}`}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-muted">
        Tiles that border land you already hold come up first in a campaign, so
        provinces fill in from the inside out.
      </p>
    </section>
  );
}

/** The numbers, all of them derived from the same store as the home dashboard. */
export function CampaignReport({
  total,
  held,
  mastered,
  atRisk,
  strength,
  longestHeld,
  now,
}: {
  total: number;
  held: number;
  mastered: number;
  atRisk: number;
  strength: number;
  longestHeld: { char: string; since: number } | null;
  now: number;
}) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="text-[0.65rem] font-semibold tracking-wider text-muted uppercase">
        Campaign report
      </h2>
      <div className="mt-3">
        <div className="flex items-baseline justify-between text-sm">
          <span className="font-medium">Territory held</span>
          <span className="tabular-nums text-muted">
            {held} / {total}
          </span>
        </div>
        <div
          className="mt-1.5 h-2 overflow-hidden rounded-full bg-line"
          role="progressbar"
          aria-valuenow={held}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-label="Territory held"
        >
          <div
            className="h-full rounded-full bg-jade transition-[width] duration-500"
            style={{ width: `${total ? (held / total) * 100 : 0}%` }}
          />
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
        <Cell label="Fortified" value={mastered} tone="text-jade" />
        <Cell label="At risk" value={atRisk} tone={atRisk ? "text-gold" : ""} />
        <Cell label="Strength" value={`${Math.round(strength * 100)}%`} />
      </dl>
      {longestHeld ? (
        <p className="mt-3 border-t border-line pt-3 text-xs text-muted">
          Longest held:{" "}
          <Link
            href={`/character/${slugFor(longestHeld.char)}`}
            className="font-hanzi text-base text-foreground underline decoration-dotted underline-offset-4"
          >
            {longestHeld.char}
          </Link>{" "}
          — standing since {relativeTime(longestHeld.since, now)}.
        </p>
      ) : null}
    </section>
  );
}

function Cell({
  label,
  value,
  tone = "",
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
  return (
    <div className="rounded-lg bg-card-soft px-2 py-2">
      <dt className="text-[0.6rem] tracking-wider text-muted uppercase">{label}</dt>
      <dd className={`mt-0.5 text-lg leading-none font-semibold tabular-nums ${tone}`}>
        {value}
      </dd>
    </div>
  );
}

/** Convenience for the parent: province rows straight off the layout + cells. */
export function provinceRows(
  layout: TerritoryLayout,
  cells: CellView[],
): ProvinceRow[] {
  return layout.provinces.map((province) => ({
    index: province.index,
    radical: province.radical,
    size: province.tiles.length,
    held: province.tiles.filter((i) => {
      const state = cells[i].state;
      return state === "held" || state === "mastered";
    }).length,
  }));
}
