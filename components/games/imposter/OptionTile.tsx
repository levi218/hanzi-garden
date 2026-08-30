"use client";

import type { ConfusableChar } from "@/lib/confusables";

export type TileState = "idle" | "answer" | "wrong" | "dimmed";

/**
 * One candidate character. The whole game is "can you see the stroke that
 * differs", so the hanzi is rendered as large as the viewport allows and
 * everything else is kept out of its way until the reveal.
 */
export function OptionTile({
  option,
  hotkey,
  state,
  disabled,
  reduced,
  onPick,
}: {
  option: ConfusableChar;
  /** 1-4; shown on the tile and bound to the number keys. */
  hotkey: number;
  state: TileState;
  disabled: boolean;
  reduced: boolean;
  onPick: () => void;
}) {
  const look =
    state === "answer"
      ? "border-jade bg-jade/15 ring-2 ring-jade/60"
      : state === "wrong"
        ? "border-seal bg-seal/15 ring-2 ring-seal/60"
        : state === "dimmed"
          ? "border-line bg-card opacity-40"
          : "border-line bg-card hover:border-seal/45 hover:bg-card-soft";

  const motion = reduced ? "" : "transition duration-150 active:scale-[0.98]";

  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      aria-label={`Option ${hotkey}`}
      className={`group relative flex min-h-28 flex-col items-center justify-center rounded-2xl border px-2 py-4 sm:min-h-40 sm:py-7 ${look} ${motion} disabled:cursor-default`}
    >
      <span
        className="absolute top-2 left-2.5 font-mono text-[0.65rem] text-muted"
        aria-hidden
      >
        {hotkey}
      </span>

      <span className="font-hanzi text-[3.25rem] leading-none font-medium sm:text-[4.75rem]">
        {option.char}
      </span>

      {/* Held back until the answer is in — seeing the pinyin would give it away. */}
      {state === "idle" || state === "dimmed" ? null : (
        <span className="mt-2 flex flex-col items-center gap-0.5 text-center sm:mt-3">
          <span className="text-sm font-medium text-seal">{option.pinyin}</span>
          <span className="line-clamp-2 max-w-[16ch] text-xs leading-snug text-muted">
            {option.meaning}
          </span>
        </span>
      )}
    </button>
  );
}
