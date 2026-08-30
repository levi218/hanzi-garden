"use client";

import Link from "next/link";

import { slugFor } from "@/lib/characters";
import type { CharState } from "@/lib/progress";
import { STATE_META, type Question, tileFill } from "@/lib/territory";
import type { CharacterEntry } from "@/lib/types";

export type RunMode = "campaign" | "defend" | "skirmish";

export interface AnswerResult {
  optionId: string;
  correct: boolean;
  /** True when the answer flipped a tile that was not ours before. */
  conquered: boolean;
  /** The tile's state before the answer — drives the "held / lost" wording. */
  before: CharState;
}

const MODE_LABEL: Record<RunMode, string> = {
  campaign: "Campaign",
  defend: "Defence",
  skirmish: "Raid",
};

/**
 * The question card. Kept next to the map rather than over it, so the tile can
 * be seen changing colour the moment an answer lands.
 */
export function BattlePanel({
  question,
  entry,
  mode,
  position,
  total,
  result,
  upcoming,
  onAnswer,
  onNext,
  onQuit,
}: {
  question: Question;
  entry: CharacterEntry;
  mode: RunMode;
  position: number;
  total: number;
  result: AnswerResult | null;
  upcoming: { char: string; state: CharState; mastery: number }[];
  onAnswer: (optionId: string) => void;
  onNext: () => void;
  onQuit: () => void;
}) {
  return (
    <section
      className="rise-in rounded-2xl border border-line bg-card p-4 shadow-sm"
      aria-label="Current attack"
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs text-muted">
          <span className="font-semibold tracking-wider uppercase">
            {MODE_LABEL[mode]}
          </span>
          {total > 1 ? (
            <span className="tabular-nums">
              {position} / {total}
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Difficulty level={question.difficulty} />
          <button
            type="button"
            onClick={onQuit}
            className="rounded-full px-2 py-1 text-xs text-muted transition hover:text-foreground"
          >
            {total > 1 ? "End run" : "Close"}
          </button>
        </div>
      </header>

      <div className="mt-3 rounded-xl border border-line bg-card-soft px-4 py-5 text-center">
        <p className="text-[0.65rem] font-semibold tracking-wider text-muted uppercase">
          {question.instruction}
        </p>
        <p
          className={
            question.promptHanzi
              ? "mt-2 font-hanzi text-5xl leading-tight font-medium"
              : "mt-2 text-2xl leading-snug font-medium"
          }
        >
          {question.prompt}
        </p>
        {question.hint ? (
          <p className="mt-2 text-xs text-muted">{question.hint}</p>
        ) : null}
      </div>

      <ul className="mt-3 grid gap-2">
        {question.options.map((option, i) => {
          const isAnswer = option.id === question.answerId;
          const chosen = result?.optionId === option.id;
          const tone = !result
            ? "border-line bg-card hover:border-foreground/30"
            : isAnswer
              ? "border-jade/60 bg-jade/10"
              : chosen
                ? "border-seal/60 bg-seal/10"
                : "border-line bg-card opacity-50";
          return (
            <li key={option.id}>
              <button
                type="button"
                disabled={Boolean(result)}
                onClick={() => onAnswer(option.id)}
                className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition disabled:cursor-default ${tone}`}
              >
                <kbd className="grid size-6 shrink-0 place-items-center rounded-md border border-line bg-card-soft text-[0.65rem] font-semibold text-muted">
                  {i + 1}
                </kbd>
                <span className="min-w-0 flex-1">
                  <span
                    className={
                      option.hanzi
                        ? "block font-hanzi text-2xl leading-none"
                        : "block text-sm leading-snug"
                    }
                  >
                    {option.text}
                  </span>
                  {option.note ? (
                    <span className="mt-0.5 block text-xs text-muted">{option.note}</span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      {result ? (
        <div className="mt-3">
          <p
            className={`text-sm font-medium ${result.correct ? "text-jade" : "text-seal"}`}
          >
            {verdict(result)}
          </p>
          <p className="mt-1 text-sm text-muted">
            <span className="font-hanzi text-lg text-foreground">{entry.char}</span>{" "}
            <span className="text-seal">{entry.pinyin}</span> —{" "}
            {entry.meanings[0]?.def ?? ""}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={onNext}
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2 text-sm font-medium text-background transition hover:opacity-85"
            >
              {position >= total ? "Finish run" : "Next tile"}
              <kbd className="rounded border border-background/30 px-1 text-[0.6rem]">
                ↵
              </kbd>
            </button>
            <Link
              href={`/character/${slugFor(entry.char)}`}
              className="text-xs text-muted underline decoration-dotted underline-offset-4 transition hover:text-foreground"
            >
              Study {entry.char}
            </Link>
          </div>
        </div>
      ) : null}

      {upcoming.length > 0 ? (
        <div className="mt-4 border-t border-line pt-3">
          <p className="text-[0.6rem] font-semibold tracking-wider text-muted uppercase">
            Marching on
          </p>
          <ol className="mt-2 flex flex-wrap gap-1.5">
            {upcoming.map((item) => (
              <li
                key={item.char}
                title={`${item.char} — ${STATE_META[item.state].label}`}
                className="grid size-8 place-items-center rounded-md border border-line font-hanzi text-lg"
                style={{ backgroundColor: tileFill(item.state, item.mastery) }}
              >
                {item.char}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </section>
  );
}

function verdict(result: AnswerResult): string {
  if (result.correct) {
    if (result.conquered) return "Taken.";
    return result.before === "mastered" ? "Fortress holds." : "Held, and deepened.";
  }
  return result.before === "unseen" || result.before === "shaky"
    ? "The attack fails."
    : "The tile slips away.";
}

/** Three pips: how hard this tile was to attack, given how well you hold it. */
function Difficulty({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span
      className="flex items-center gap-1"
      title={`Difficulty ${level} of 3`}
      aria-label={`Difficulty ${level} of 3`}
    >
      {[1, 2, 3].map((pip) => (
        <span
          key={pip}
          aria-hidden
          className={`size-1.5 rounded-full ${
            pip <= level ? "bg-indigo" : "bg-line"
          }`}
        />
      ))}
    </span>
  );
}
