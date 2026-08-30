"use client";

import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";

import type { CharState } from "@/lib/progress";
import {
  type ArrowKey,
  type TerritoryLayout,
  stepFocus,
  tileFill,
  tileStroke,
  tileTextFill,
} from "@/lib/territory";

/** Per-tile paint input. `mastery` arrives quantized so fills rarely change. */
export interface CellView {
  state: CharState;
  mastery: number;
}

export type TileFlash = "win" | "loss" | null;

interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MIN_SPAN = 60; // user units — roughly three hexes across
const ARROWS: ArrowKey[] = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];

function fitView(layout: TerritoryLayout): View {
  const pad = layout.size * 1.6;
  return {
    x: layout.bounds.minX - pad,
    y: layout.bounds.minY - pad,
    w: layout.bounds.width + pad * 2,
    h: layout.bounds.height + pad * 2,
  };
}

/** Zoom about a fixed point in user space, so the map grows under the cursor. */
function zoomView(view: View, factor: number, atX: number, atY: number, maxW: number): View {
  const w = Math.min(maxW, Math.max(MIN_SPAN, view.w * factor));
  const scale = w / view.w;
  const h = view.h * scale;
  return { x: atX - (atX - view.x) * scale, y: atY - (atY - view.y) * scale, w, h };
}

/**
 * The map. Everything about a tile that can change is a primitive prop so the
 * memoized tiles stay put: a run of ten answers repaints ten hexes, not 565.
 */
export function HexMap({
  layout,
  cells,
  labels,
  selected,
  focus,
  flashIndex,
  flash,
  highlightProvince,
  onActivate,
  onFocusTile,
  onHover,
}: {
  layout: TerritoryLayout;
  cells: CellView[];
  /** Accessible name per tile, index-aligned with `layout.tiles`. */
  labels: string[];
  selected: number | null;
  focus: number;
  flashIndex: number | null;
  flash: TileFlash;
  highlightProvince: number | null;
  onActivate: (index: number) => void;
  onFocusTile: (index: number) => void;
  onHover: (index: number | null) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [view, setView] = useState<View>(() => fitView(layout));
  // Drag bookkeeping lives in refs: a pan must not repaint 565 hexes per frame
  // beyond the viewBox change, and a drag must not fire the tile underneath.
  const drag = useRef<{ id: number; x: number; y: number; view: View; moved: boolean } | null>(
    null,
  );
  const pinch = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchStart = useRef<{ dist: number; view: View } | null>(null);
  const insideRef = useRef(false);

  const maxSpan = useMemo(() => fitView(layout).w * 2.5, [layout]);

  /** Client pixels → user units, for pans and for zoom anchoring. */
  const toUser = useCallback(
    (clientX: number, clientY: number, from: View) => {
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return { x: from.x, y: from.y, scale: 1 };
      // preserveAspectRatio="meet": the smaller of the two ratios wins.
      const scale = Math.min(rect.width / from.w, rect.height / from.h);
      const offsetX = (rect.width - from.w * scale) / 2;
      const offsetY = (rect.height - from.h * scale) / 2;
      return {
        x: from.x + (clientX - rect.left - offsetX) / scale,
        y: from.y + (clientY - rect.top - offsetY) / scale,
        scale,
      };
    },
    [],
  );

  // Wheel has to be a native non-passive listener; React's synthetic onWheel
  // cannot preventDefault reliably, and without that the page scrolls away.
  useEffect(() => {
    const el = svgRef.current;
    if (!el) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setView((current) => {
        const at = toUser(event.clientX, event.clientY, current);
        return zoomView(current, Math.exp(event.deltaY * 0.0015), at.x, at.y, maxSpan);
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [toUser, maxSpan]);

  // Roving focus: the parent owns the index, the DOM follows — but only while
  // the keyboard is actually inside the map.
  useEffect(() => {
    if (!insideRef.current) return;
    const el = svgRef.current?.querySelector<SVGGElement>(`[data-tile="${focus}"]`);
    el?.focus();
  }, [focus]);

  const handlePointerDown = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    pinch.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    if (pinch.current.size === 2) {
      const [a, b] = [...pinch.current.values()];
      pinchStart.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), view: view };
      drag.current = null;
      return;
    }
    // No pointer capture yet — capturing here would retarget the follow-up
    // click to the <svg>, and tiles would stop being clickable. Capture is
    // taken below, only once the pointer has actually travelled.
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY, view, moved: false };
  }, [view]);

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<SVGSVGElement>) => {
      if (pinch.current.has(event.pointerId)) {
        pinch.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      }
      if (pinch.current.size === 2 && pinchStart.current) {
        const [a, b] = [...pinch.current.values()];
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (dist > 0) {
          const start = pinchStart.current;
          const mid = toUser((a.x + b.x) / 2, (a.y + b.y) / 2, start.view);
          setView(zoomView(start.view, start.dist / dist, mid.x, mid.y, maxSpan));
        }
        return;
      }
      const state = drag.current;
      if (!state || state.id !== event.pointerId) return;
      const rect = svgRef.current?.getBoundingClientRect();
      if (!rect) return;
      const scale = Math.min(rect.width / state.view.w, rect.height / state.view.h);
      const dx = (event.clientX - state.x) / scale;
      const dy = (event.clientY - state.y) / scale;
      if (!state.moved && Math.abs(event.clientX - state.x) + Math.abs(event.clientY - state.y) > 5) {
        state.moved = true;
        // Now it is unambiguously a pan: capture, so the drag survives leaving
        // the map, and so the click lands on the <svg> instead of a tile.
        event.currentTarget.setPointerCapture(event.pointerId);
      }
      setView({ ...state.view, x: state.view.x - dx, y: state.view.y - dy });
    },
    [toUser, maxSpan],
  );

  const endPointer = useCallback((event: ReactPointerEvent<SVGSVGElement>) => {
    pinch.current.delete(event.pointerId);
    if (pinch.current.size < 2) pinchStart.current = null;
    if (drag.current?.id === event.pointerId) {
      // Keep `moved` readable for the click that follows this pointerup.
      const moved = drag.current.moved;
      drag.current = null;
      if (moved) {
        const svg = svgRef.current;
        if (svg) svg.dataset.dragged = "1";
        window.setTimeout(() => {
          if (svg) delete svg.dataset.dragged;
        }, 0);
      }
    }
  }, []);

  const handleActivate = useCallback(
    (index: number) => {
      if (svgRef.current?.dataset.dragged) return; // that was a pan, not a click
      onActivate(index);
    },
    [onActivate],
  );

  const handleKey = useCallback(
    (event: ReactKeyboardEvent<SVGGElement>, index: number) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        onActivate(index);
        return;
      }
      if ((ARROWS as string[]).includes(event.key)) {
        event.preventDefault();
        onFocusTile(stepFocus(layout, index, event.key as ArrowKey));
      }
    },
    [layout, onActivate, onFocusTile],
  );

  // Rows are the accessibility skeleton (role="row") and a sane paint order.
  const rows = useMemo(() => {
    const byRow = new Map<number, number[]>();
    for (const tile of layout.tiles) {
      const row = byRow.get(tile.r);
      if (row) row.push(tile.index);
      else byRow.set(tile.r, [tile.index]);
    }
    return [...byRow.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([r, indices]) => ({
        r,
        indices: indices.sort((a, b) => layout.tiles[a].q - layout.tiles[b].q),
      }));
  }, [layout]);

  const resetView = useCallback(() => setView(fitView(layout)), [layout]);
  const zoomBy = useCallback(
    (factor: number) =>
      setView((current) =>
        zoomView(
          current,
          factor,
          current.x + current.w / 2,
          current.y + current.h / 2,
          maxSpan,
        ),
      ),
    [maxSpan],
  );

  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-background-deep texture-paper">
      <svg
        ref={svgRef}
        viewBox={`${view.x} ${view.y} ${view.w} ${view.h}`}
        preserveAspectRatio="xMidYMid meet"
        role="grid"
        aria-label={`Territory map, ${layout.tiles.length} tiles. Arrow keys move between neighbouring tiles, Enter attacks.`}
        className="block h-[58vh] max-h-[680px] min-h-[340px] w-full touch-none select-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={endPointer}
        onPointerCancel={endPointer}
        onPointerLeave={() => onHover(null)}
        onFocusCapture={() => {
          insideRef.current = true;
        }}
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            insideRef.current = false;
          }
        }}
      >
        <defs>
          <pattern
            id="terr-hatch"
            width="3.2"
            height="3.2"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="3.2"
              stroke="color-mix(in oklab, var(--seal) 55%, transparent)"
              strokeWidth="0.9"
            />
          </pattern>
        </defs>

        {/* Province ink sits under the tiles so the glyphs stay crisp. */}
        <g aria-hidden="true" fill="none">
          {layout.provinces.map((province) => (
            <path
              key={province.index}
              d={province.border}
              stroke={
                province.index === highlightProvince
                  ? "var(--indigo)"
                  : "color-mix(in oklab, var(--foreground) 30%, transparent)"
              }
              strokeWidth={province.index === highlightProvince ? 1.5 : 0.9}
              strokeLinecap="round"
            />
          ))}
        </g>

        {rows.map((row) => (
          <g key={row.r} role="row">
            {row.indices.map((index) => {
              const tile = layout.tiles[index];
              const cell = cells[index];
              return (
                <HexTile
                  key={tile.char}
                  index={index}
                  x={tile.x}
                  y={tile.y}
                  char={tile.char}
                  points={layout.points}
                  innerPoints={layout.innerPoints}
                  outerPoints={layout.outerPoints}
                  state={cell.state}
                  fill={tileFill(cell.state, cell.mastery)}
                  stroke={tileStroke(cell.state)}
                  textFill={tileTextFill(cell.state)}
                  label={labels[index]}
                  selected={selected === index}
                  tabIndex={focus === index ? 0 : -1}
                  flash={flashIndex === index ? flash : null}
                  onActivate={handleActivate}
                  onFocusTile={onFocusTile}
                  onHover={onHover}
                  onKey={handleKey}
                />
              );
            })}
          </g>
        ))}
      </svg>

      <div className="absolute top-3 right-3 flex flex-col gap-1">
        <MapButton label="Zoom in" onClick={() => zoomBy(1 / 1.35)}>
          +
        </MapButton>
        <MapButton label="Zoom out" onClick={() => zoomBy(1.35)}>
          −
        </MapButton>
        <MapButton label="Fit map to screen" onClick={resetView}>
          <span className="text-[0.6rem] font-semibold tracking-wide">FIT</span>
        </MapButton>
      </div>
    </div>
  );
}

function MapButton({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="grid size-8 place-items-center rounded-lg border border-line bg-card/85 text-sm text-muted backdrop-blur transition hover:text-foreground"
    >
      {children}
    </button>
  );
}

const HexTile = memo(function HexTile({
  index,
  x,
  y,
  char,
  points,
  innerPoints,
  outerPoints,
  state,
  fill,
  stroke,
  textFill,
  label,
  selected,
  tabIndex,
  flash,
  onActivate,
  onFocusTile,
  onHover,
  onKey,
}: {
  index: number;
  x: number;
  y: number;
  char: string;
  points: string;
  innerPoints: string;
  outerPoints: string;
  state: CharState;
  fill: string;
  stroke: string;
  textFill: string;
  label: string;
  selected: boolean;
  tabIndex: number;
  flash: TileFlash;
  onActivate: (index: number) => void;
  onFocusTile: (index: number) => void;
  onHover: (index: number | null) => void;
  onKey: (event: ReactKeyboardEvent<SVGGElement>, index: number) => void;
}) {
  return (
    <g
      className="terr-tile"
      data-tile={index}
      transform={`translate(${x} ${y})`}
      role="gridcell"
      aria-label={label}
      aria-selected={selected}
      tabIndex={tabIndex}
      onClick={() => onActivate(index)}
      onKeyDown={(event) => onKey(event, index)}
      onFocus={() => onFocusTile(index)}
      onPointerEnter={() => onHover(index)}
    >
      <polygon points={points} fill={fill} stroke={stroke} strokeWidth={0.55} />
      {state === "fading" ? (
        <polygon points={points} fill="url(#terr-hatch)" stroke="none" />
      ) : null}
      {state === "mastered" ? (
        <polygon
          points={innerPoints}
          fill="none"
          stroke="var(--gold)"
          strokeWidth={0.7}
          opacity={0.8}
        />
      ) : null}
      {selected ? (
        <polygon
          points={outerPoints}
          fill="none"
          stroke="var(--indigo)"
          strokeWidth={1.2}
        />
      ) : null}
      <text
        className="font-hanzi"
        textAnchor="middle"
        dominantBaseline="central"
        fontSize={9.6}
        fill={textFill}
        pointerEvents="none"
      >
        {char}
      </text>
      {flash ? (
        <polygon
          className="terr-flash"
          points={outerPoints}
          fill="none"
          stroke={flash === "win" ? "var(--jade)" : "var(--seal)"}
          strokeWidth={1.8}
          pointerEvents="none"
        />
      ) : null}
    </g>
  );
});
