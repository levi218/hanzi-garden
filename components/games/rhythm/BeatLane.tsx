"use client";

import { useEffect, useRef } from "react";

import type { Note } from "@/lib/strokes";

/** How far ahead of the hit line a note first appears, in beats. */
const LOOKAHEAD_BEATS = 3;

/** Where the hit line sits across the lane, 0 = left edge. */
const HIT_FRACTION = 0.14;

/** Width of a note token in px — must match the `size-9` class below. */
const TOKEN_PX = 36;

export interface BeatLaneProps {
  /** `performance.now()` timestamp each stroke is due. Empty in practice mode. */
  beats: number[];
  notes: Note[];
  /** Beat length in ms. */
  beat: number;
  dueIndex: number;
  reduced: boolean;
  practice: boolean;
}

export function BeatLane({ beats, notes, beat, dueIndex, reduced, practice }: BeatLaneProps) {
  const laneRef = useRef<HTMLDivElement | null>(null);
  const tokensRef = useRef(new Map<number, HTMLElement>());
  // The animation loop reads the newest schedule without being restarted by it;
  // beats are rescheduled every time the player falls behind.
  const stateRef = useRef({ beats, notes, beat });
  useEffect(() => {
    stateRef.current = { beats, notes, beat };
  });

  const scrolling = !practice && !reduced && beat > 0;

  useEffect(() => {
    if (!scrolling) return;
    let frame = 0;
    const step = () => {
      const lane = laneRef.current;
      if (lane) {
        const current = stateRef.current;
        const span = LOOKAHEAD_BEATS * current.beat;
        const travel = Math.max(0, lane.clientWidth - TOKEN_PX);
        // performance.now() in a rAF callback is not a render read.
        const now = performance.now();
        for (const [index, el] of tokensRef.current) {
          const at = current.beats[index];
          if (at === undefined || current.notes[index]?.status !== "pending") {
            el.style.opacity = "0";
            continue;
          }
          const progress = (at - now) / span; // 1 = just spawned, 0 = on the line
          const x = (HIT_FRACTION + (1 - HIT_FRACTION) * progress) * travel;
          el.style.transform = `translate3d(${x.toFixed(1)}px, 0, 0)`;
          el.style.opacity = progress > 1.04 ? "0" : progress < -0.45 ? "0.3" : "1";
        }
      }
      frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [scrolling]);

  if (!scrolling) {
    // Practice mode and reduced-motion get the same thing: the running order,
    // standing still. No scroll, no pulse, same information.
    const upcoming = notes
      .map((note, index) => ({ note, index }))
      .filter((entry) => entry.note.status === "pending")
      .slice(0, 6);
    return (
      <div className="flex h-14 items-center gap-2 overflow-hidden rounded-2xl border border-line bg-card-soft px-3">
        <span className="shrink-0 text-[0.6rem] font-semibold tracking-wider text-muted uppercase">
          {practice ? "Order" : "Next"}
        </span>
        {upcoming.map(({ index }) => (
          <span
            key={index}
            className={`grid size-9 shrink-0 place-items-center rounded-xl text-sm font-semibold tabular-nums ${
              index === dueIndex
                ? "bg-gold/15 text-gold ring-1 ring-gold/40"
                : "bg-card text-muted ring-1 ring-line"
            }`}
          >
            {index + 1}
          </span>
        ))}
        {upcoming.length === 0 ? (
          <span className="text-sm text-muted">Character complete</span>
        ) : null}
      </div>
    );
  }

  return (
    <div
      ref={laneRef}
      className="relative h-14 overflow-hidden rounded-2xl border border-line bg-card-soft"
      aria-hidden
    >
      {/* The hit line: strokes are due when their token reaches it. */}
      <div
        className="absolute inset-y-1.5 w-[3px] rounded-full bg-gold/60"
        style={{ left: `calc(${HIT_FRACTION * 100}% + ${TOKEN_PX / 2}px)` }}
      />
      <div
        className="absolute inset-y-0 left-0 bg-gradient-to-r from-gold/10 to-transparent"
        style={{ width: `calc(${HIT_FRACTION * 100}% + ${TOKEN_PX}px)` }}
      />
      {notes.map((note, index) => (
        <span
          key={index}
          ref={(el) => {
            const map = tokensRef.current;
            if (el) map.set(index, el);
            else map.delete(index);
          }}
          className={`absolute top-2.5 left-0 grid size-9 place-items-center rounded-xl text-sm font-semibold tabular-nums will-change-transform ${
            note.status === "pending"
              ? "bg-card text-foreground ring-1 ring-gold/40"
              : "opacity-0"
          }`}
          style={{ opacity: 0 }}
        >
          {index + 1}
        </span>
      ))}
    </div>
  );
}
