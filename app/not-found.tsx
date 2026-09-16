import type { Metadata } from "next";
import Link from "next/link";

import { GAME_LIST } from "@/lib/games";

export const metadata: Metadata = {
  title: "Page not found",
  description: "That page is not part of the garden.",
  // A 404 that gets indexed is a 404 that outranks a real page.
  robots: { index: false, follow: true },
};

export default function NotFound() {
  return (
    <main className="px-4 pb-20 sm:px-6">
      <div className="mx-auto max-w-2xl pt-20 pb-10 text-center">
        <p className="font-hanzi text-7xl leading-none text-seal sm:text-8xl">迷</p>
        <h1 className="mt-6 text-3xl font-semibold tracking-tight sm:text-4xl">
          Lost in the garden
        </h1>
        <p className="mt-4 text-base leading-relaxed text-muted">
          <span className="font-hanzi">迷</span>{" "}
          <span className="font-mono text-sm">mí</span> — to be confused, to lose
          the way. There is no page at this address.
        </p>

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full bg-foreground px-5 py-2.5 text-sm font-medium text-background transition hover:opacity-85"
          >
            All 565 characters
          </Link>
          <Link
            href="/games"
            className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-5 py-2.5 text-sm font-medium transition hover:border-foreground/30"
          >
            The games
          </Link>
        </div>

        <ul className="mt-12 flex flex-wrap justify-center gap-2 text-sm">
          {GAME_LIST.map((game) => (
            <li key={game.id}>
              <Link
                href={game.href}
                className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 text-muted transition hover:text-foreground"
              >
                <span className={`size-1.5 rounded-full ${game.accent.dot}`} aria-hidden />
                <span className="font-hanzi">{game.hanzi}</span>
                {game.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
