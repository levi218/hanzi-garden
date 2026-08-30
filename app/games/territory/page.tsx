import type { Metadata } from "next";

import { TerritoryGame } from "@/components/games/territory/TerritoryGame";
import { GAMES } from "@/lib/games";
import { pageMetadata } from "@/lib/site";

const meta = GAMES.territory;
const TITLE = `${meta.name} — ${meta.tagline}`;

export const metadata: Metadata = {
  title: TITLE,
  description: meta.blurb,
  ...pageMetadata({
    path: meta.href,
    title: `${TITLE} · 汉字 Garden`,
    description: meta.blurb,
  }),
};

export default function TerritoryPage() {
  return <TerritoryGame />;
}
