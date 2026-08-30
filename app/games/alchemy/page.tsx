import type { Metadata } from "next";

import { AlchemyGame } from "@/components/games/alchemy/AlchemyGame";
import { CRAFTABLE_TOTAL, RECIPES } from "@/lib/alchemy";
import { GAMES } from "@/lib/games";
import { pageMetadata } from "@/lib/site";

const meta = GAMES.alchemy;
const TITLE = `${meta.name} — ${meta.tagline}`;
const DESCRIPTION = `${meta.blurb} ${RECIPES.length} recipes, ${CRAFTABLE_TOTAL} characters to discover.`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  ...pageMetadata({
    path: meta.href,
    title: `${TITLE} · 汉字 Garden`,
    description: DESCRIPTION,
  }),
};

export default function AlchemyPage() {
  return <AlchemyGame />;
}
