import Link from "next/link";

import { LEVEL_STYLES, type CharacterCardData } from "@/lib/characters";

export function CharacterCard({ card }: { card: CharacterCardData }) {
  const style = LEVEL_STYLES[card.hsk];

  return (
    <Link
      href={`/character/${card.slug}`}
      className={`group relative flex flex-col items-center overflow-hidden rounded-2xl border border-line bg-card px-3 py-5 text-center shadow-[0_1px_0_rgba(0,0,0,0.03)] transition duration-200 hover:-translate-y-1 hover:shadow-lg hover:shadow-black/5 ${style.border}`}
    >
      <span
        className={`pointer-events-none absolute inset-x-0 -top-16 h-24 bg-gradient-to-b ${style.glow} to-transparent opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-100`}
        aria-hidden
      />
      <span
        className={`absolute top-2.5 right-2.5 flex items-center gap-1 text-[0.6rem] font-semibold tracking-wider ${style.accent} opacity-70`}
      >
        <span className={`size-1.5 rounded-full ${style.dot}`} aria-hidden />
        {style.short}
      </span>

      <span className="font-hanzi text-5xl leading-none font-medium transition-transform duration-200 group-hover:scale-105">
        {card.char}
      </span>
      <span className="mt-3 text-sm font-medium text-seal">{card.pinyin}</span>
      <span className="mt-1 line-clamp-2 text-xs leading-snug text-muted">
        {card.def}
      </span>
    </Link>
  );
}
