"use client";

/**
 * Two concentric arcs: the outer one is how much of the level has been held at
 * least once, the inner one how much is solid *right now* after decay. The gap
 * between them is the review debt, which is the number worth looking at.
 */
export function MasteryRing({
  strength,
  coverage,
  label,
  sublabel,
  color,
  size = 92,
}: {
  strength: number;
  coverage: number;
  label: string;
  sublabel?: string;
  /** A CSS colour — pass a `var(--…)` token so it follows the theme. */
  color: string;
  size?: number;
}) {
  const radius = 38;
  const inner = 29;
  const circumference = 2 * Math.PI * radius;
  const innerCircumference = 2 * Math.PI * inner;

  return (
    <div
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg viewBox="0 0 100 100" className="size-full -rotate-90" aria-hidden>
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke="var(--line)"
          strokeWidth="7"
        />
        <circle
          cx="50"
          cy="50"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - Math.min(1, coverage))}
          opacity="0.3"
        />
        <circle
          cx="50"
          cy="50"
          r={inner}
          fill="none"
          stroke={color}
          strokeWidth="5"
          strokeLinecap="round"
          strokeDasharray={innerCircumference}
          strokeDashoffset={innerCircumference * (1 - Math.min(1, strength))}
        />
      </svg>
      <div className="absolute text-center leading-none">
        <div className="text-lg font-semibold tabular-nums">{label}</div>
        {sublabel ? (
          <div className="mt-0.5 text-[0.6rem] text-muted">{sublabel}</div>
        ) : null}
      </div>
    </div>
  );
}
