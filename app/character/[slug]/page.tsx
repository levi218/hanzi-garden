import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Fragment } from "react";

import { HskBadge } from "@/components/HskBadge";
import { CharacterMemory } from "@/components/progress/CharacterMemory";
import {
  LEVEL_STYLES,
  characters,
  findBySlug,
  neighborsFor,
  slugFor,
} from "@/lib/characters";
import { canonical, pageMetadata, site } from "@/lib/site";
import type { CharacterEntry } from "@/lib/types";

export function generateStaticParams() {
  return characters.map((entry) => ({ slug: slugFor(entry.char) }));
}

export async function generateMetadata({
  params,
}: PageProps<"/character/[slug]">): Promise<Metadata> {
  const { slug } = await params;
  const entry = findBySlug(slug);
  if (!entry) return { title: "Character not found" };

  const title = `${entry.char} (${entry.pinyin}) — ${entry.meanings[0]?.def ?? ""}`;
  const description = describe(entry);

  return {
    title,
    description,
    ...pageMetadata({
      path: `/character/${slug}`,
      // The hanzi leads the shared title too — it is the whole point of the
      // page and the one part a reader recognises at a glance.
      title: `${title} · ${site.fullName}`,
      description,
    }),
  };
}

/** One sentence carrying everything a search result should be able to answer. */
function describe(entry: CharacterEntry): string {
  const senses = entry.meanings.map((m) => m.def).join("; ");
  return `${entry.char} ${entry.pinyin}, HSK ${entry.hsk}, ${entry.strokes} strokes, radical ${entry.radical}. ${senses}`;
}

/**
 * Structured data for one character.
 *
 * `DefinedTerm` is the closest schema.org has to a dictionary entry, and the
 * `BreadcrumbList` alongside it is what turns the raw URL in a search result
 * into "汉字 Garden › HSK 2 › 好".
 */
function characterJsonLd(entry: CharacterEntry) {
  const url = canonical(`/character/${slugFor(entry.char)}`);
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "DefinedTerm",
        "@id": url,
        name: entry.char,
        alternateName: entry.pinyin,
        description: describe(entry),
        url,
        inDefinedTermSet: {
          "@type": "DefinedTermSet",
          name: `${site.fullName} — HSK 1-3 characters`,
          url: canonical("/"),
        },
        termCode: entry.char,
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: site.fullName,
            item: canonical("/"),
          },
          { "@type": "ListItem", position: 2, name: `HSK ${entry.hsk}` },
          { "@type": "ListItem", position: 3, name: entry.char, item: url },
        ],
      },
    ],
  };
}

export default async function CharacterPage({
  params,
}: PageProps<"/character/[slug]">) {
  const { slug } = await params;
  const entry = findBySlug(slug);
  if (!entry) notFound();

  const style = LEVEL_STYLES[entry.hsk];
  const { prev, next, position, levelSize } = neighborsFor(entry);

  return (
    <main className="px-4 pb-20 sm:px-6">
      <script
        type="application/ld+json"
        // Built from the bundled dataset — no user input reaches it.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(characterJsonLd(entry)),
        }}
      />
      <div className="mx-auto max-w-4xl">
        <nav className="flex items-center justify-between gap-4 py-6 text-sm">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-muted transition hover:text-foreground"
          >
            <span aria-hidden>&larr;</span> All characters
          </Link>
          <span className="text-xs tracking-wide text-muted uppercase">
            {style.label} · {position} of {levelSize}
          </span>
        </nav>

        {/* Hero: the character itself */}
        <section className="rise-in grid gap-6 sm:grid-cols-[minmax(0,15rem)_1fr] sm:items-stretch">
          <div className="texture-paper relative mx-auto flex aspect-square w-full max-w-[15rem] items-center justify-center overflow-hidden rounded-3xl border border-line bg-card sm:max-w-none">
            <span
              className={`pointer-events-none absolute -inset-8 bg-gradient-to-br ${style.glow} to-transparent opacity-60 blur-2xl`}
              aria-hidden
            />
            <span className="relative font-hanzi text-[7.5rem] leading-none font-medium sm:text-[8.5rem]">
              {entry.char}
            </span>
          </div>

          <div className="flex flex-col justify-center gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <HskBadge level={entry.hsk} size="md" />
              <span className="text-3xl font-semibold text-seal sm:text-4xl">
                {entry.pinyin}
              </span>
            </div>

            <dl className="flex flex-wrap gap-2">
              <Stat label="Strokes" value={String(entry.strokes)} />
              <Stat label="Radical" value={entry.radical} hanzi />
              <Stat label="Parts" value={String(entry.components.length)} />
            </dl>

            <ol className="mt-1 space-y-2">
              {entry.meanings.map((meaning, index) => (
                <li
                  key={`${meaning.pos}-${index}`}
                  className="flex items-baseline gap-3 rounded-xl border border-line bg-card px-4 py-2.5"
                >
                  <span className="min-w-14 shrink-0 font-mono text-[0.7rem] tracking-wide text-muted lowercase">
                    {meaning.pos}
                  </span>
                  <span className="text-[0.95rem] leading-snug">
                    {meaning.def}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <CharacterMemory char={entry.char} />

        {/* Building blocks */}
        <section className="mt-12">
          <SectionTitle kicker="拆" title="Building blocks" />

          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-2 gap-y-3 sm:justify-start sm:gap-x-3">
            {entry.components.map((component, index) => (
              <Fragment key={`${component.part}-${index}`}>
                {index > 0 ? <Joiner symbol="+" /> : null}
                <div className="min-w-28 flex-1 rounded-2xl border border-line bg-card px-4 py-3 text-center sm:flex-none">
                  <div className="font-hanzi text-3xl leading-none">
                    {component.part}
                  </div>
                  <div className="mt-2 text-xs font-medium text-seal">
                    {component.pinyin}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {component.meaning}
                  </div>
                </div>
              </Fragment>
            ))}
            <Joiner symbol="=" />
            <div className="min-w-28 flex-1 rounded-2xl border border-dashed border-seal/35 bg-card-soft px-4 py-3 text-center sm:flex-none">
              <div className="font-hanzi text-3xl leading-none">{entry.char}</div>
              <div className="mt-2 text-xs font-medium text-seal">
                {entry.pinyin}
              </div>
              <div className="mt-0.5 text-xs text-muted">
                {entry.meanings[0]?.def.split(";")[0]}
              </div>
            </div>
          </div>

          <p className="mt-5 max-w-2xl border-l-2 border-line pl-4 text-[0.95rem] leading-relaxed text-muted italic">
            {entry.compositionNote}
          </p>
        </section>

        {/* The mnemonic poem — the star of the page */}
        <section className="mt-12">
          <SectionTitle kicker="诗" title="Remember it" />

          <figure className="texture-paper relative mt-5 overflow-hidden rounded-3xl border border-seal/30 bg-gradient-to-br from-seal-soft from-10% via-card-soft via-70% to-card px-6 py-10 shadow-sm ring-1 ring-seal/10 ring-inset sm:px-12 sm:py-12">
            <span
              className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-seal/70 via-gold/50 to-transparent"
              aria-hidden
            />
            <span
              className="pointer-events-none absolute -top-6 left-4 font-serif text-[9rem] leading-none text-seal/20 select-none"
              aria-hidden
            >
              &ldquo;
            </span>
            <span
              className="pointer-events-none absolute right-5 bottom-4 rotate-6 rounded-md border-2 border-seal/45 px-2.5 py-1.5 font-hanzi text-2xl text-seal/45 select-none sm:right-8 sm:bottom-6 sm:text-3xl"
              aria-hidden
            >
              {entry.char}
            </span>

            <blockquote className="relative space-y-2.5">
              {entry.poem.map((line, index) => (
                <p
                  key={index}
                  className="flex items-baseline gap-3 text-lg leading-relaxed sm:text-xl"
                >
                  <span
                    className="w-4 shrink-0 text-right font-mono text-[0.7rem] text-seal/50 tabular-nums"
                    aria-hidden
                  >
                    {index + 1}
                  </span>
                  <span className="font-medium">{line}</span>
                </p>
              ))}
            </blockquote>

            <figcaption className="relative mt-6 text-xs tracking-wide text-muted uppercase">
              A mnemonic for{" "}
              <span className="font-hanzi text-sm normal-case">
                {entry.char}
              </span>{" "}
              &middot; {entry.pinyin}
            </figcaption>
          </figure>
        </section>

        {/* Example words */}
        <section className="mt-12">
          <SectionTitle kicker="词" title="Words to try" />

          <ul className="mt-5 grid gap-3 sm:grid-cols-2">
            {entry.words.map((word, index) => (
              <li
                key={`${word.word}-${index}`}
                className="flex items-baseline justify-between gap-4 rounded-2xl border border-line bg-card px-5 py-4"
              >
                <div>
                  <div className="font-hanzi text-2xl leading-none">
                    {word.word}
                  </div>
                  <div className="mt-1.5 text-xs font-medium text-seal">
                    {word.pinyin}
                  </div>
                </div>
                <div className="text-right text-sm text-muted">
                  {word.meaning}
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* Prev / next within the same HSK level */}
        <nav className="mt-14 grid gap-3 sm:grid-cols-2">
          <NeighborLink entry={prev} direction="prev" />
          <NeighborLink entry={next} direction="next" />
        </nav>

        <div className="mt-8 text-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 rounded-full border border-line bg-card px-5 py-2.5 text-sm font-medium transition hover:border-seal/40"
          >
            <span aria-hidden>&larr;</span> Back to all characters
          </Link>
        </div>
      </div>
    </main>
  );
}

function Stat({
  label,
  value,
  hanzi = false,
}: {
  label: string;
  value: string;
  hanzi?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line bg-card-soft px-3.5 py-2">
      <dt className="text-[0.6rem] font-semibold tracking-wider text-muted uppercase">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-base font-semibold ${hanzi ? "font-hanzi" : "tabular-nums"}`}
      >
        {value}
      </dd>
    </div>
  );
}

function Joiner({ symbol }: { symbol: string }) {
  return (
    <span
      className="shrink-0 text-2xl font-light text-muted/60 select-none"
      aria-hidden
    >
      {symbol}
    </span>
  );
}

function SectionTitle({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="flex items-center gap-3">
      <span
        className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-line bg-card-soft font-hanzi text-sm text-muted"
        aria-hidden
      >
        {kicker}
      </span>
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      <span className="h-px flex-1 bg-line" aria-hidden />
    </div>
  );
}

function NeighborLink({
  entry,
  direction,
}: {
  entry?: CharacterEntry;
  direction: "prev" | "next";
}) {
  if (!entry) {
    return (
      <span className="rounded-2xl border border-dashed border-line px-5 py-4 text-sm text-muted/60">
        {direction === "prev" ? "Start of this level" : "End of this level"}
      </span>
    );
  }

  return (
    <Link
      href={`/character/${slugFor(entry.char)}`}
      className={`group flex items-center gap-4 rounded-2xl border border-line bg-card px-5 py-4 transition hover:-translate-y-0.5 hover:shadow-md hover:shadow-black/5 ${
        direction === "next" ? "sm:flex-row-reverse sm:text-right" : ""
      }`}
    >
      <span className="font-hanzi text-3xl leading-none transition-transform group-hover:scale-105">
        {entry.char}
      </span>
      <span className="min-w-0">
        <span className="block text-[0.65rem] font-semibold tracking-wider text-muted uppercase">
          {direction === "prev" ? "Previous" : "Next"}
        </span>
        <span className="block truncate text-sm font-medium text-seal">
          {entry.pinyin}
        </span>
        <span className="block truncate text-xs text-muted">
          {entry.meanings[0]?.def}
        </span>
      </span>
    </Link>
  );
}
