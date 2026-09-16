import { LEVEL_STYLES, type HskLevel } from "@/lib/characters";

export function HskBadge({
  level,
  size = "sm",
  className = "",
}: {
  level: HskLevel;
  size?: "sm" | "md";
  className?: string;
}) {
  const style = LEVEL_STYLES[level];
  const sizing =
    size === "md"
      ? "text-xs px-3 py-1.5 gap-2"
      : "text-[0.65rem] px-2 py-0.5 gap-1.5";

  return (
    <span
      className={`inline-flex items-center rounded-full font-semibold tracking-wide uppercase ring-1 ring-inset ${style.badge} ${sizing} ${className}`}
    >
      <span className={`size-1.5 rounded-full ${style.dot}`} aria-hidden />
      {style.label}
    </span>
  );
}
