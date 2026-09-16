"use client";

import Link from "next/link";
import type { ReactNode } from "react";

import { GAMES, type GameId } from "@/lib/games";

/**
 * Shared chrome for a game page: title block on the left, live stats on the
 * right, then the board. Every game uses it so the four feel like one app.
 */
export function GameShell({
  game,
  stats,
  controls,
  children,
  footer,
}: {
  game: GameId;
  /** Live readouts (score, timer, streak…) shown in the header. */
  stats?: ReactNode;
  /** Level pickers, restart buttons — sits under the header. */
  controls?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const meta = GAMES[game];

  return (
    <main className="px-4 pb-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <div className="flex items-center justify-between gap-4 py-5 text-sm">
          <Link
            href="/games"
            className="inline-flex items-center gap-2 text-muted transition hover:text-foreground"
          >
            <span aria-hidden>&larr;</span> All games
          </Link>
          <span className={`text-xs tracking-wide uppercase ${meta.accent.text}`}>
            {meta.tagline}
          </span>
        </div>

        <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-4">
          <div className="flex items-center gap-4">
            <span
              className={`grid size-14 shrink-0 place-items-center rounded-2xl font-hanzi text-lg leading-tight ring-1 ${meta.accent.soft} ${meta.accent.ring} ${meta.accent.text}`}
              aria-hidden
            >
              {meta.hanzi}
            </span>
            <div>
              <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
                {meta.name}
              </h1>
              <p className="mt-1 max-w-xl text-sm text-muted">{meta.blurb}</p>
            </div>
          </div>
          {stats ? (
            <div className="flex flex-wrap items-center gap-2">{stats}</div>
          ) : null}
        </header>

        {controls ? <div className="mb-6">{controls}</div> : null}

        {children}

        {footer ? <div className="mt-10">{footer}</div> : null}
      </div>
    </main>
  );
}

/** One boxed number in the game header. */
export function StatChip({
  label,
  value,
  tone = "",
}: {
  label: string;
  value: ReactNode;
  tone?: string;
}) {
  return (
    <div className="min-w-[4.5rem] rounded-xl border border-line bg-card px-3 py-2 text-center">
      <div className="text-[0.6rem] font-semibold tracking-wider text-muted uppercase">
        {label}
      </div>
      <div className={`mt-0.5 text-xl leading-none font-semibold tabular-nums ${tone}`}>
        {value}
      </div>
    </div>
  );
}

/** A pill-group picker, matching the HSK filter on the browse page. */
export function PillGroup<T extends string | number>({
  label,
  options,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  options: { value: T; label: string; dot?: string }[];
  value: T;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="inline-flex flex-wrap gap-1 rounded-full border border-line bg-card-soft p-1"
      role="group"
      aria-label={label}
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={String(option.value)}
            type="button"
            disabled={disabled}
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
              active
                ? "bg-card text-foreground shadow-sm ring-1 ring-line"
                : "text-muted hover:text-foreground"
            }`}
          >
            {option.dot ? (
              <span className={`size-1.5 rounded-full ${option.dot}`} aria-hidden />
            ) : null}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}

/** The primary call-to-action button used across the games. */
export function ActionButton({
  children,
  onClick,
  type = "button",
  variant = "solid",
  className = "",
  disabled = false,
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "solid" | "ghost";
  className?: string;
  disabled?: boolean;
}) {
  const base =
    "inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-45";
  const look =
    variant === "solid"
      ? "bg-foreground text-background hover:opacity-85"
      : "border border-line bg-card text-foreground hover:border-foreground/30";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${look} ${className}`}
    >
      {children}
    </button>
  );
}
