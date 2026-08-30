import Link from "next/link";

import { CharacterBrowser } from "@/components/CharacterBrowser";
import { GameGrid } from "@/components/GameGrid";
import { ProgressDashboard } from "@/components/progress/ProgressDashboard";
import {
  HSK_LEVELS,
  LEVEL_STYLES,
  buildCardData,
  characters,
  countsByLevel,
  totalCount,
} from "@/lib/characters";
import { site } from "@/lib/site";

const LEVEL_BLURBS: Record<(typeof HSK_LEVELS)[number], string> = {
  1: "First words",
  2: "Everyday talk",
  3: "Real conversations",
};

export default function Home() {
  const cards = buildCardData();
  const watermark = characters.slice(0, 12).map((c) => c.char);

  return (
    <main className="px-4 pb-20 sm:px-6">
      <header className="texture-paper relative mx-auto mt-6 mb-12 max-w-6xl overflow-hidden rounded-3xl border border-line bg-card/70 px-6 py-14 sm:px-12 sm:py-20">
        <div
          className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/2 flex-wrap content-center justify-end gap-x-4 gap-y-1 overflow-hidden pr-6 font-hanzi text-7xl leading-none opacity-[0.06] select-none lg:flex"
          aria-hidden
        >
          {watermark.map((char, index) => (
            <span key={`${char}-${index}`}>{char}</span>
          ))}
        </div>

        <div className="relative max-w-2xl">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1 text-xs font-medium tracking-wide text-muted uppercase">
            <span className="size-1.5 rounded-full bg-seal" aria-hidden />
            HSK 1 – 3 · {totalCount} characters
          </p>

          <h1 className="text-5xl leading-[1.05] font-semibold tracking-tight sm:text-6xl">
            <span className="font-hanzi">{site.hanziName}</span>{" "}
            <span className="text-seal">{site.latinName}</span>
          </h1>

          <p className="mt-5 max-w-xl text-base leading-relaxed text-muted sm:text-lg">
            {site.tagline}
          </p>

          <dl className="mt-9 grid max-w-lg grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-line bg-card px-4 py-3">
              <dt className="text-[0.65rem] font-semibold tracking-wider text-muted uppercase">
                Total
              </dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums">
                {totalCount}
              </dd>
              <dd className="text-[0.7rem] text-muted">characters</dd>
            </div>
            {HSK_LEVELS.map((level) => {
              const style = LEVEL_STYLES[level];
              return (
                <div
                  key={level}
                  className="rounded-2xl border border-line bg-card px-4 py-3"
                >
                  <dt
                    className={`flex items-center gap-1.5 text-[0.65rem] font-semibold tracking-wider uppercase ${style.accent}`}
                  >
                    <span
                      className={`size-1.5 rounded-full ${style.dot}`}
                      aria-hidden
                    />
                    {style.label}
                  </dt>
                  <dd className="mt-1 text-2xl font-semibold tabular-nums">
                    {countsByLevel[level]}
                  </dd>
                  <dd className="text-[0.7rem] text-muted">
                    {LEVEL_BLURBS[level]}
                  </dd>
                </div>
              );
            })}
          </dl>

          <div className="mt-9 flex flex-wrap gap-3">
            <Link
              href="/games"
              className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition hover:opacity-85"
            >
              Play the games
              <span aria-hidden>&rarr;</span>
            </Link>
            <a
              href="#browse"
              className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-5 py-2.5 text-sm font-medium transition hover:border-foreground/30"
            >
              Start browsing
              <span aria-hidden>&darr;</span>
            </a>
          </div>
        </div>
      </header>

      <div className="mx-auto mb-14 max-w-6xl">
        <ProgressDashboard variant="home" />
      </div>

      <section className="mx-auto mb-16 max-w-6xl" aria-label="Games">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight sm:text-3xl">
              <span className="font-hanzi">游戏</span>{" "}
              <span className="text-muted">— practice</span>
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted">
              Four angles on the same problem: the parts, the look-alikes, the
              stroke order, and the slow forgetting.
            </p>
          </div>
          <Link
            href="/games"
            className="text-sm text-muted underline underline-offset-4 transition hover:text-foreground"
          >
            About the games
          </Link>
        </div>
        <GameGrid />
      </section>

      <CharacterBrowser cards={cards} />
    </main>
  );
}
