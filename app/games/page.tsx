import type { Metadata } from "next";
import Link from "next/link";

import { GameGrid } from "@/components/GameGrid";
import { ProgressDashboard } from "@/components/progress/ProgressDashboard";
import { totalCount } from "@/lib/characters";
import { pageMetadata } from "@/lib/site";

const DESCRIPTION =
  "Four ways to make Chinese characters stick: fuse components into characters, tell look-alikes apart, trace stroke order on the beat, and hold an HSK level as territory on a map.";

export const metadata: Metadata = {
  title: "Games",
  description: DESCRIPTION,
  ...pageMetadata({
    path: "/games",
    title: "Games · 汉字 Garden",
    description: DESCRIPTION,
  }),
};

export default function GamesPage() {
  return (
    <main className="px-4 pb-20 sm:px-6">
      <div className="mx-auto max-w-6xl">
        <header className="texture-paper relative mt-6 mb-10 overflow-hidden rounded-3xl border border-line bg-card/70 px-6 py-12 sm:px-10">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-xs font-medium tracking-wide text-muted uppercase">
            <span className="size-1.5 rounded-full bg-seal" aria-hidden />
            Four games · {totalCount} characters
          </p>
          <h1 className="max-w-2xl text-4xl leading-[1.1] font-semibold tracking-tight sm:text-5xl">
            Recognition is not the same as{" "}
            <span className="font-hanzi text-seal">记得</span> remembering.
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted">
            Reading a character once is easy. Recalling it a week later is the
            hard part — so each of these attacks a different failure: not knowing
            the parts, mixing up look-alikes, guessing at stroke order, and
            quietly forgetting what you learned last month. They all write to the
            same memory, so time spent anywhere counts everywhere.
          </p>
          <p className="mt-4 text-sm text-muted">
            Prefer to read first?{" "}
            <Link
              href="/"
              className="underline underline-offset-4 transition hover:text-foreground"
            >
              Browse the characters
            </Link>
            .
          </p>
        </header>

        <GameGrid />

        <div className="mt-14">
          <ProgressDashboard variant="home" />
        </div>
      </div>
    </main>
  );
}
