"use client";

import { useEffect, useRef } from "react";

import {
  BOX,
  HANZI_TRANSFORM,
  type Note,
  type Pt,
  type StrokeCharacter,
} from "@/lib/strokes";

/**
 * Consecutive pointer samples closer than this add nothing but noise. Dropping
 * them keeps the path array small on a 120Hz screen without changing the shape.
 */
const MIN_SAMPLE_GAP = 3;

export interface StrokeCanvasProps {
  data: StrokeCharacter;
  notes: Note[];
  /** Stroke the player is meant to be drawing, or -1 when the board is done. */
  dueIndex: number;
  /** Show the median dashes, start dot and direction arrow for the due stroke. */
  guides: boolean;
  reduced: boolean;
  /** False while loading or during the between-characters pause. */
  active: boolean;
  onTrace: (path: Pt[], startedAt: number, endedAt: number) => void;
  /** Fires on pointer down/up with the `performance.now()` of that moment. */
  onDrawingChange: (drawing: boolean, at: number) => void;
}

function pointsAttr(points: Pt[]): string {
  return points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
}

/** Ink colour for a stroke, by how the player dealt with it. */
function strokeClass(note: Note, isDue: boolean): string {
  if (note.status === "hit") return "text-foreground opacity-100";
  if (note.status === "missed") return "text-muted opacity-50";
  if (isDue) return "text-gold opacity-60";
  return "text-foreground opacity-10";
}

export function StrokeCanvas({
  data,
  notes,
  dueIndex,
  guides,
  reduced,
  active,
  onTrace,
  onDrawingChange,
}: StrokeCanvasProps) {
  // The wet-ink trail is written straight to the DOM. Feeding every pointermove
  // through React state would re-render the whole board 120 times a second for
  // a single polyline that nothing else depends on.
  const inkRef = useRef<SVGPolylineElement | null>(null);
  const pathRef = useRef<Pt[]>([]);
  const downAtRef = useRef(0);
  const pointerIdRef = useRef<number | null>(null);

  useEffect(() => {
    // New character, or the due stroke moved on: wipe the trail React cannot see.
    pathRef.current = [];
    inkRef.current?.setAttribute("points", "");
  }, [data, dueIndex]);

  function localPoint(event: React.PointerEvent<SVGSVGElement>): Pt {
    const rect = event.currentTarget.getBoundingClientRect();
    // The wrapper is forced square, so both axes share the same scale factor.
    return {
      x: ((event.clientX - rect.left) / rect.width) * BOX,
      y: ((event.clientY - rect.top) / rect.height) * BOX,
    };
  }

  function handleDown(event: React.PointerEvent<SVGSVGElement>) {
    if (!active || dueIndex < 0 || pointerIdRef.current !== null) return;
    event.preventDefault();
    pointerIdRef.current = event.pointerId;
    // Capture so a trace that wanders off the square still reports its moves.
    event.currentTarget.setPointerCapture(event.pointerId);
    pathRef.current = [localPoint(event)];
    const at = performance.now();
    downAtRef.current = at;
    inkRef.current?.setAttribute("points", pointsAttr(pathRef.current));
    onDrawingChange(true, at);
  }

  function handleMove(event: React.PointerEvent<SVGSVGElement>) {
    if (pointerIdRef.current !== event.pointerId) return;
    const point = localPoint(event);
    const path = pathRef.current;
    const last = path[path.length - 1];
    if (last && Math.hypot(point.x - last.x, point.y - last.y) < MIN_SAMPLE_GAP) return;
    path.push(point);
    inkRef.current?.setAttribute("points", pointsAttr(path));
  }

  function finish(event: React.PointerEvent<SVGSVGElement>, cancelled: boolean) {
    if (pointerIdRef.current !== event.pointerId) return;
    pointerIdRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    const path = pathRef.current;
    pathRef.current = [];
    inkRef.current?.setAttribute("points", "");
    const at = performance.now();
    onDrawingChange(false, at);
    if (!cancelled && path.length > 0) onTrace(path, downAtRef.current, at);
  }

  const median = dueIndex >= 0 ? data.medians[dueIndex] : null;
  const start = median?.[0];
  // Take the direction from a little way back along the median: the final two
  // points of a hooked stroke can be almost coincident.
  const tip = median?.[median.length - 1];
  const before = median?.[Math.max(0, median.length - 3)];
  let arrow = "";
  if (tip && before) {
    const angle = Math.atan2(tip.y - before.y, tip.x - before.x);
    const at = (turn: number, r: number) => ({
      x: tip.x + Math.cos(angle + turn) * r,
      y: tip.y + Math.sin(angle + turn) * r,
    });
    arrow = pointsAttr([at(0, 34), at(2.5, 38), at(-2.5, 38)]);
  }

  return (
    <svg
      viewBox={`0 0 ${BOX} ${BOX}`}
      role="img"
      aria-label={`Tracing surface for ${data.char}, stroke ${dueIndex + 1} of ${data.strokes.length}`}
      className={`h-full w-full select-none ${active ? "cursor-crosshair" : "cursor-default"}`}
      // Without this a drag on a phone scrolls the page instead of drawing.
      style={{ touchAction: "none" }}
      onPointerDown={handleDown}
      onPointerMove={handleMove}
      onPointerUp={(event) => finish(event, false)}
      onPointerCancel={(event) => finish(event, true)}
    >
      {/* 米字格 — the practice-paper grid, genuinely useful for judging placement */}
      <g className="text-line" fill="none" stroke="currentColor">
        <rect x="10" y="10" width="1004" height="1004" rx="20" strokeWidth="3" />
        <path d="M512 10 V1014 M10 512 H1014" strokeWidth="2" strokeDasharray="16 18" />
        <path
          d="M10 10 L1014 1014 M1014 10 L10 1014"
          strokeWidth="2"
          strokeDasharray="10 24"
          opacity="0.6"
        />
      </g>

      {/* The character itself. Raw path data is in Make Me a Hanzi's flipped
          space, so the whole layer gets the un-flipping transform. */}
      <g transform={HANZI_TRANSFORM}>
        {data.strokes.map((d, index) => (
          <path
            key={index}
            d={d}
            fill="currentColor"
            className={`transition-opacity duration-300 ${strokeClass(notes[index], index === dueIndex)}`}
          />
        ))}
      </g>

      {/* Guides and wet ink are already in canvas space — no transform. */}
      {guides && median && start ? (
        <g className="text-gold">
          <polyline
            points={pointsAttr(median)}
            fill="none"
            stroke="currentColor"
            strokeWidth="7"
            strokeDasharray="22 24"
            strokeLinecap="round"
            opacity="0.85"
          />
          <polygon points={arrow} fill="currentColor" opacity="0.85" />
          <circle cx={start.x} cy={start.y} r="30" fill="currentColor" />
          <circle
            cx={start.x}
            cy={start.y}
            r="44"
            fill="none"
            stroke="currentColor"
            strokeWidth="6"
            opacity="0.45"
          >
            {reduced ? null : (
              <animate
                attributeName="r"
                values="40;62;40"
                dur="1.5s"
                repeatCount="indefinite"
              />
            )}
          </circle>
          <text
            x={start.x}
            y={start.y}
            dy="0.36em"
            textAnchor="middle"
            fontSize="34"
            fontWeight="700"
            fill="var(--background)"
          >
            {dueIndex + 1}
          </text>
        </g>
      ) : null}

      <polyline
        ref={inkRef}
        points=""
        fill="none"
        className="text-gold"
        stroke="currentColor"
        strokeWidth="30"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.5"
      />
    </svg>
  );
}
