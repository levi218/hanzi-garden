"use client";

import Link from "next/link";

import { ActionButton } from "@/components/games/GameShell";
import { characters, slugFor } from "@/lib/characters";
import { accuracyOf, gradeCharacter, type CharResult } from "@/lib/strokes";

const BY_CHAR = new Map(characters.map((entry) => [entry.char, entry]));

export interface ResultsProps {
  results: CharResult[];
  score: number;
  maxCombo: number;
  /** Personal best from the progress store, or null before hydration. */
  best: number | null;
  practice: boolean;
  onPlayAgain: () => void;
  onChangeSettings: () => void;
}

export function Results({
  results,
  score,
  maxCombo,
  best,
  practice,
  onPlayAgain,
  onChangeSettings,
}: ResultsProps) {
  const strokes = results.reduce((sum, r) => sum + r.strokes, 0);
  const hits = results.reduce((sum, r) => sum + r.hits, 0);
  const perfect = results.reduce((sum, r) => sum + r.perfect, 0);
  const orderErrors = results.reduce((sum, r) => sum + r.orderErrors, 0);
  const clean = results.filter((r) => gradeCharacter(r).correct).length;

  return (
    <section className="rise-in rounded-3xl border border-line bg-card p-6 sm:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Run complete</h2>
          <p className="mt-1 text-sm text-muted">
            {clean} of {results.length} characters written in the right order.
            {practice ? " Practice runs are not scored against your best." : null}
          </p>
        </div>
        <div className="text-right">
          <div className="text-[0.6rem] font-semibold tracking-wider text-muted uppercase">
            {practice ? "Practice score" : "Score"}
          </div>
          <div className="font-hanzi text-4xl leading-none font-semibold text-gold tabular-nums">
            {score.toLocaleString()}
          </div>
          {!practice && best !== null ? (
            <div className="mt-1 text-xs text-muted tabular-nums">
              {score >= best && score > 0 ? "New personal best" : `Best ${best.toLocaleString()}`}
            </div>
          ) : null}
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Summary label="Strokes landed" value={`${hits}/${strokes}`} />
        <Summary
          label="Accuracy"
          value={`${Math.round((strokes ? hits / strokes : 0) * 100)}%`}
        />
        <Summary label="Max combo" value={`${maxCombo}`} />
        <Summary
          label="Order slips"
          value={`${orderErrors}`}
          tone={orderErrors === 0 ? "text-jade" : "text-seal"}
        />
      </dl>

      <div className="mt-6 overflow-hidden rounded-2xl border border-line">
        <table className="w-full text-sm">
          <caption className="sr-only">Per-character breakdown of this run</caption>
          <thead className="bg-card-soft text-[0.6rem] tracking-wider text-muted uppercase">
            <tr>
              <th scope="col" className="px-3 py-2 text-left font-semibold">
                Character
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Strokes
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Perfect
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Order
              </th>
              <th scope="col" className="px-3 py-2 text-right font-semibold">
                Points
              </th>
            </tr>
          </thead>
          <tbody>
            {results.map((result, index) => {
              const entry = BY_CHAR.get(result.char);
              const ok = gradeCharacter(result).correct;
              return (
                <tr key={`${result.char}-${index}`} className="border-t border-line">
                  <td className="px-3 py-2">
                    <Link
                      href={`/character/${slugFor(result.char)}`}
                      className="inline-flex items-center gap-2 transition hover:text-seal"
                    >
                      <span className="font-hanzi text-xl leading-none">{result.char}</span>
                      <span className="text-xs text-muted">{entry?.pinyin ?? ""}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {result.hits}/{result.strokes}
                    <span className="ml-1 text-xs text-muted">
                      {Math.round(accuracyOf(result) * 100)}%
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{result.perfect}</td>
                  <td
                    className={`px-3 py-2 text-right tabular-nums ${ok ? "text-jade" : "text-seal"}`}
                  >
                    {result.orderErrors === 0 ? "clean" : `${result.orderErrors} slip`}
                  </td>
                  <td className="px-3 py-2 text-right font-medium tabular-nums">
                    {result.score.toLocaleString()}
                  </td>
                </tr>
              );
            })}
          </tbody>
          <tfoot className="border-t border-line bg-card-soft">
            <tr>
              <td className="px-3 py-2 text-xs tracking-wider text-muted uppercase">Total</td>
              <td className="px-3 py-2 text-right tabular-nums">
                {hits}/{strokes}
              </td>
              <td className="px-3 py-2 text-right tabular-nums">{perfect}</td>
              <td className="px-3 py-2 text-right tabular-nums">{orderErrors}</td>
              <td className="px-3 py-2 text-right font-semibold tabular-nums">
                {score.toLocaleString()}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <ActionButton onClick={onPlayAgain}>Play again</ActionButton>
        <ActionButton onClick={onChangeSettings} variant="ghost">
          Change tempo or level
        </ActionButton>
      </div>
    </section>
  );
}

function Summary({ label, value, tone = "" }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card-soft px-4 py-3">
      <dt className="text-[0.6rem] font-semibold tracking-wider text-muted uppercase">
        {label}
      </dt>
      <dd className={`mt-1 text-xl leading-none font-semibold tabular-nums ${tone}`}>
        {value}
      </dd>
    </div>
  );
}
