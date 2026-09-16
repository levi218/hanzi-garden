"use client";

import type { AlchemyElement } from "@/lib/alchemy";
import { LEVEL_STYLES } from "@/lib/characters";

/** MIME type for the drag payload — one element key, as text. */
export const DRAG_TYPE = "text/plain";

/**
 * One inventory tile.
 *
 * It is a real `<button>` on purpose: that buys tab focus, Enter/Space and a
 * screen-reader role for free, so the click-to-pick path is the accessible
 * path rather than a bolted-on fallback. HTML5 drag is layered on top for
 * mice; touch devices fall back to tapping, which is why tap-to-pick has to be
 * the primary interaction and not the other way round.
 */
export function ElementTile({
  element,
  selected = false,
  highlighted = false,
  onPick,
  onCombine,
}: {
  element: AlchemyElement;
  /** Sitting in the first cauldron slot. */
  selected?: boolean;
  /** Just discovered — pulses once to draw the eye to where it landed. */
  highlighted?: boolean;
  onPick: (key: string) => void;
  /** A tile was dropped on this one: fuse the two. */
  onCombine?: (source: string, target: string) => void;
}) {
  const isCharacter = element.kind === "character";
  const levelDot = element.hsk ? LEVEL_STYLES[element.hsk].dot : "";

  return (
    <button
      type="button"
      draggable
      aria-pressed={selected}
      aria-label={`${element.key}${element.pinyin ? `, ${element.pinyin}` : ""}, ${
        element.gloss
      }, ${isCharacter ? `HSK ${element.hsk} character` : "component part"}`}
      title={`${element.key} ${element.pinyin} — ${element.gloss}`}
      onClick={() => onPick(element.key)}
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_TYPE, element.key);
        event.dataTransfer.effectAllowed = "copy";
      }}
      onDragOver={(event) => {
        if (!onCombine) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        if (!onCombine) return;
        event.preventDefault();
        const source = event.dataTransfer.getData(DRAG_TYPE);
        if (source) onCombine(source, element.key);
      }}
      className={`group relative flex w-full cursor-pointer flex-col items-center rounded-xl border px-1.5 py-2 text-center transition select-none hover:-translate-y-0.5 hover:shadow-sm ${
        isCharacter
          ? "border-line bg-card"
          : "border-dashed border-line bg-card-soft/70"
      } ${
        selected
          ? "-translate-y-0.5 border-jade/60 shadow-sm ring-2 ring-jade/45"
          : ""
      } ${highlighted ? "alchemy-pop ring-2 ring-jade/50" : ""}`}
    >
      {isCharacter ? (
        <span
          className={`absolute top-1 right-1 size-1.5 rounded-full ${levelDot}`}
          aria-hidden
        />
      ) : null}
      <span
        className={`font-hanzi text-2xl leading-none ${isCharacter ? "" : "text-muted"}`}
      >
        {element.key}
      </span>
      {element.pinyin ? (
        <span className="mt-1.5 block w-full truncate text-[0.6rem] leading-none font-medium text-seal">
          {element.pinyin}
        </span>
      ) : null}
      <span className="mt-1 block w-full truncate text-[0.6rem] leading-none text-muted">
        {element.gloss}
      </span>
    </button>
  );
}

/**
 * A cauldron slot. Empty slots are drop targets so a mouse user can drag two
 * pieces in; filled ones carry a remove button so a pick can be undone without
 * reaching for Escape.
 */
export function SlotBox({
  element,
  index,
  onDropElement,
  onClear,
}: {
  element?: AlchemyElement;
  index: 1 | 2;
  onDropElement?: (key: string) => void;
  onClear?: () => void;
}) {
  return (
    <div
      onDragOver={(event) => {
        if (!onDropElement) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDrop={(event) => {
        if (!onDropElement) return;
        event.preventDefault();
        const source = event.dataTransfer.getData(DRAG_TYPE);
        if (source) onDropElement(source);
      }}
      className={`relative flex h-24 flex-1 flex-col items-center justify-center rounded-2xl border px-2 text-center ${
        element
          ? "border-jade/40 bg-card ring-1 ring-jade/20"
          : "border-dashed border-line bg-card-soft/60"
      }`}
    >
      {element ? (
        <>
          <span className="font-hanzi text-3xl leading-none">{element.key}</span>
          <span className="mt-1.5 w-full truncate text-[0.65rem] font-medium text-seal">
            {element.pinyin}
          </span>
          <span className="w-full truncate text-[0.65rem] text-muted">
            {element.gloss}
          </span>
          {onClear ? (
            <button
              type="button"
              onClick={onClear}
              aria-label={`Remove ${element.key} from slot ${index}`}
              className="absolute top-1 right-1 grid size-5 cursor-pointer place-items-center rounded-full text-muted transition hover:bg-card-soft hover:text-foreground"
            >
              <span aria-hidden>&times;</span>
            </button>
          ) : null}
        </>
      ) : (
        <span className="text-[0.7rem] leading-snug text-muted/70">
          {index === 1 ? "Pick an element" : "…then another"}
        </span>
      )}
    </div>
  );
}
