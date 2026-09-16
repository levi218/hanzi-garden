"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { GAME_LIST } from "@/lib/games";
import { site } from "@/lib/site";

const SECTIONS = [
  { href: "/", label: "Characters" },
  { href: "/games", label: "Games" },
  { href: "/progress", label: "Progress" },
] as const;

export function SiteNav() {
  const pathname = usePathname() ?? "/";
  const normalized = pathname.replace(/\/+$/, "") || "/";

  function isActive(href: string) {
    if (href === "/") return normalized === "/" || normalized.startsWith("/character");
    return normalized === href || normalized.startsWith(`${href}/`);
  }

  return (
    <header className="sticky top-0 z-40 border-b border-line/70 bg-background/80 backdrop-blur-md">
      <nav
        aria-label="Main"
        className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6"
      >
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-full py-1 pr-2 text-sm font-semibold"
        >
          <span className="grid size-7 place-items-center rounded-md bg-seal font-hanzi text-[0.9rem] leading-none text-white shadow-sm">
            {site.hanziName.slice(0, 1)}
          </span>
          <span className="hidden sm:inline">{site.latinName}</span>
        </Link>

        <ul className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto text-sm">
          {SECTIONS.map((section) => (
            <li key={section.href}>
              <Link
                href={section.href}
                aria-current={isActive(section.href) ? "page" : undefined}
                className={`inline-block rounded-full px-3 py-1.5 whitespace-nowrap transition ${
                  isActive(section.href)
                    ? "bg-card font-medium text-foreground ring-1 ring-line"
                    : "text-muted hover:text-foreground"
                }`}
              >
                {section.label}
              </Link>
            </li>
          ))}
        </ul>

        <ul className="hidden items-center gap-0.5 lg:flex">
          {GAME_LIST.map((game) => (
            <li key={game.id}>
              <Link
                href={game.href}
                title={game.tagline}
                aria-current={isActive(game.href) ? "page" : undefined}
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs transition ${
                  isActive(game.href)
                    ? "bg-card font-medium text-foreground ring-1 ring-line"
                    : "text-muted hover:text-foreground"
                }`}
              >
                <span className={`size-1.5 rounded-full ${game.accent.dot}`} aria-hidden />
                <span className="font-hanzi text-sm">{game.hanzi}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </header>
  );
}
