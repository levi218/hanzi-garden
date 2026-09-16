"use client";

import { useMemo } from "react";

import { activityWindow, type ProgressState } from "@/lib/progress";

const WEEKDAY_LABELS = ["Mon", "", "Wed", "", "Fri", "", ""];

/** Five buckets from "nothing" to "a real session". */
function levelFor(answers: number): number {
  if (answers === 0) return 0;
  if (answers < 10) return 1;
  if (answers < 25) return 2;
  if (answers < 60) return 3;
  return 4;
}

const FILLS = [
  "bg-line",
  "bg-jade/25",
  "bg-jade/45",
  "bg-jade/70",
  "bg-jade",
] as const;

export function ActivityHeatmap({
  progress,
  weeks = 18,
  now,
}: {
  progress: ProgressState;
  weeks?: number;
  now: number;
}) {
  const columns = useMemo(() => {
    // Pad backwards to the start of a week so the columns line up as weeks.
    const today = new Date(now);
    const offsetToMonday = (today.getDay() + 6) % 7;
    const days = weeks * 7 - (6 - offsetToMonday);
    const window = activityWindow(progress, days, now);

    const result: (typeof window)[] = [];
    let current: typeof window = [];
    // The first column may be short; pad it so the week grid starts on Monday.
    for (let i = 0; i < (window.length ? (window[0].date.getDay() + 6) % 7 : 0); i += 1) {
      current.push(null as unknown as (typeof window)[number]);
    }
    for (const day of window) {
      current.push(day);
      if (current.length === 7) {
        result.push(current);
        current = [];
      }
    }
    if (current.length) result.push(current);
    return result;
  }, [progress, weeks, now]);

  const monthLabels = useMemo(
    () =>
      columns.map((column, index) => {
        const first = column.find(Boolean);
        if (!first) return "";
        const previous = columns[index - 1]?.find(Boolean);
        if (previous && previous.date.getMonth() === first.date.getMonth()) return "";
        return first.date.toLocaleDateString(undefined, { month: "short" });
      }),
    [columns],
  );

  return (
    <div className="overflow-x-auto">
      <div className="flex min-w-max gap-1">
        <div
          className="mt-4 grid shrink-0 gap-1 pr-1 text-[0.55rem] text-muted"
          aria-hidden
        >
          {WEEKDAY_LABELS.map((label, index) => (
            <span key={index} className="h-2.5 leading-[0.625rem]">
              {label}
            </span>
          ))}
        </div>

        <div className="flex gap-1">
          {columns.map((column, index) => (
            <div key={index} className="flex flex-col gap-1">
              <span className="h-3 text-[0.55rem] whitespace-nowrap text-muted" aria-hidden>
                {monthLabels[index]}
              </span>
              {Array.from({ length: 7 }, (_, row) => {
                const day = column[row];
                if (!day) {
                  return <span key={row} className="size-2.5" aria-hidden />;
                }
                const level = levelFor(day.stat.answers);
                return (
                  <span
                    key={row}
                    className={`size-2.5 rounded-[3px] ${FILLS[level]}`}
                    title={`${day.key}: ${day.stat.answers} ${
                      day.stat.answers === 1 ? "answer" : "answers"
                    }`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 flex items-center gap-1.5 text-[0.6rem] text-muted">
        <span>Quiet</span>
        {FILLS.map((fill, index) => (
          <span key={index} className={`size-2.5 rounded-[3px] ${fill}`} aria-hidden />
        ))}
        <span>Busy</span>
      </div>
    </div>
  );
}
