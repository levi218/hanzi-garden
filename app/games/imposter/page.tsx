import type { Metadata } from "next";

import { ImposterGame } from "@/components/games/imposter/ImposterGame";
import { GAMES } from "@/lib/games";
import { pageMetadata } from "@/lib/site";

const meta = GAMES.imposter;
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

export default function ImposterPage() {
  return <ImposterGame />;
}
