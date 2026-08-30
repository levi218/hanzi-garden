import type { HskLevel } from "@/lib/characters";

export const GAME_IDS = [
  "alchemy",
  "imposter",
  "rhythm",
  "territory",
] as const;

export type GameId = (typeof GAME_IDS)[number];

export interface GameMeta {
  id: GameId;
  /** URL segment under /games. */
  href: `/games/${GameId}`;
  /** Short title used in nav + cards. */
  name: string;
  /** Two-hanzi label shown as the game's "seal". */
  hanzi: string;
  /** One line, shown under the title. */
  tagline: string;
  /** A sentence on what the game actually trains. */
  blurb: string;
  /** How the headline number for this game should read. */
  scoreLabel: string;
  /** Tailwind classes — kept as whole strings so Tailwind keeps them. */
  accent: {
    text: string;
    dot: string;
    ring: string;
    soft: string;
    gradient: string;
  };
}

export const GAMES: Record<GameId, GameMeta> = {
  alchemy: {
    id: "alchemy",
    href: "/games/alchemy",
    name: "Character Alchemy",
    hanzi: "合成",
    tagline: "Fuse components into characters",
    blurb:
      "Drag 女 onto 子 and get 好. Characters are not 2000 arbitrary pictures — they are a small set of parts, recombined.",
    scoreLabel: "discovered",
    accent: {
      text: "text-jade",
      dot: "bg-jade",
      ring: "ring-jade/30",
      soft: "bg-jade/10",
      gradient: "from-jade/25",
    },
  },
  imposter: {
    id: "imposter",
    href: "/games/imposter",
    name: "Spot the Imposter",
    hanzi: "辨识",
    tagline: "Tell near-identical characters apart",
    blurb:
      "未 or 末? 己, 已 or 巳? Rapid rounds on the look-alikes that quietly cost you points, with the clock closing in.",
    scoreLabel: "best score",
    accent: {
      text: "text-seal",
      dot: "bg-seal",
      ring: "ring-seal/30",
      soft: "bg-seal/10",
      gradient: "from-seal/25",
    },
  },
  rhythm: {
    id: "rhythm",
    href: "/games/rhythm",
    name: "Stroke Rhythm",
    hanzi: "笔顺",
    tagline: "Trace stroke order, on the beat",
    blurb:
      "Strokes scroll in and you trace them in sequence. Correct order is scored, not just correct shape.",
    scoreLabel: "best score",
    accent: {
      text: "text-gold",
      dot: "bg-gold",
      ring: "ring-gold/30",
      soft: "bg-gold/10",
      gradient: "from-gold/25",
    },
  },
  territory: {
    id: "territory",
    href: "/games/territory",
    name: "Territory Map",
    hanzi: "疆域",
    tagline: "Conquer characters, hold the map",
    blurb:
      "Every character is a hex you take by answering correctly. Neglect it and it fades back to neutral — a review queue disguised as a campaign.",
    scoreLabel: "tiles held",
    accent: {
      text: "text-indigo",
      dot: "bg-indigo",
      ring: "ring-indigo/30",
      soft: "bg-indigo/10",
      gradient: "from-indigo/25",
    },
  },
};

export const GAME_LIST: GameMeta[] = GAME_IDS.map((id) => GAMES[id]);

/** HSK levels a game can be scoped to, in the order shown in pickers. */
export const PLAYABLE_LEVELS: (HskLevel | "all")[] = ["all", 1, 2, 3];
