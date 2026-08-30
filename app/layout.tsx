import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { Analytics } from "@/components/analytics/Analytics";
import { ConsentBanner } from "@/components/analytics/ConsentBanner";
import { ConsentBootstrap } from "@/components/analytics/ConsentBootstrap";
import { ConsentSettings } from "@/components/analytics/ConsentSettings";
import { HanziFontProbe } from "@/components/HanziFontProbe";
import { SiteNav } from "@/components/SiteNav";
import { canonical, local, origin, site } from "@/lib/site";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  // Origin only — see the note on `origin` in lib/site.ts.
  metadataBase: new URL(origin),
  title: {
    default: `${site.fullName} — learn the most-used Chinese characters`,
    template: `%s · ${site.fullName}`,
  },
  description: site.description,
  applicationName: site.fullName,
  alternates: { canonical: canonical("/") },
  keywords: [
    "Chinese characters",
    "hanzi",
    "HSK 1",
    "HSK 2",
    "HSK 3",
    "pinyin",
    "stroke order",
    "mnemonics",
    "learn Chinese",
    "Chinese flashcards",
  ],
  authors: [{ name: site.fullName }],
  creator: site.fullName,
  publisher: site.fullName,
  category: "education",
  openGraph: {
    type: "website",
    siteName: site.fullName,
    locale: site.locale,
    url: canonical("/"),
    title: `${site.fullName} — learn the most-used Chinese characters`,
    description: site.description,
    images: [site.ogImage],
  },
  twitter: {
    card: "summary_large_image",
    title: `${site.fullName} — learn the most-used Chinese characters`,
    description: site.description,
    images: [site.ogImage.url],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  // Declared by hand rather than through app/icon.* so that every href goes
  // through `local()` and picks up the sub-path a project-site deploy adds.
  icons: {
    icon: [
      { url: local("icon.svg"), type: "image/svg+xml" },
      { url: local("favicon-32.png"), sizes: "32x32", type: "image/png" },
      { url: local("favicon-96.png"), sizes: "96x96", type: "image/png" },
      // Named explicitly because a project site is not at the domain root, so
      // a bare /favicon.ico request would never reach this copy.
      { url: local("favicon.ico"), sizes: "32x32", type: "image/x-icon" },
    ],
    apple: [{ url: local("apple-icon.png"), sizes: "180x180", type: "image/png" }],
  },
  manifest: local("manifest.webmanifest"),
  // Pinyin like "hǎo 3" should not become a phone number on iOS.
  formatDetection: { telephone: false, email: false, address: false },
};

export const viewport: Viewport = {
  // Matches --background in app/globals.css, so the browser chrome on mobile
  // blends into the page in either scheme.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf6ee" },
    { media: "(prefers-color-scheme: dark)", color: "#14110d" },
  ],
  colorScheme: "light dark",
};

/**
 * Site-level structured data: the name and description a search engine should
 * use for the site as a whole.
 *
 * Deliberately no `SearchAction`. The character browser filters in local state
 * and has no URL for a query, so advertising a search endpoint would be a
 * claim the site cannot honour.
 */
const websiteJsonLd = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  name: site.fullName,
  alternateName: `${site.hanziName} ${site.latinName}`,
  url: canonical("/"),
  description: site.description,
  inLanguage: "en",
  isAccessibleForFree: true,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col">
        <HanziFontProbe />
        <ConsentBootstrap />
        <script
          type="application/ld+json"
          // Static, author-controlled object — no user input reaches it.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }}
        />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-foreground focus:px-4 focus:py-2 focus:text-sm focus:text-background"
        >
          Skip to content
        </a>
        <SiteNav />
        <div id="main" className="flex-1">
          {children}
        </div>
        <footer className="border-t border-line/70 px-4 py-8 text-center text-xs text-muted sm:px-6">
          <p>
            <span className="font-hanzi">{site.hanziName}</span>{" "}
            <span className="font-medium">{site.latinName}</span> — built for
            slow, curious study. Definitions and mnemonics are learning aids, not
            a dictionary.
          </p>
          <p className="mt-2 text-[0.7rem] text-muted/80">
            Progress is stored in this browser only. Stroke-order data from{" "}
            <a
              href="https://github.com/chanind/hanzi-writer-data"
              className="underline underline-offset-2 hover:text-foreground"
              rel="noreferrer noopener"
              target="_blank"
            >
              Hanzi Writer
            </a>
            , derived from Make Me a Hanzi (Arphic Public License).
          </p>
          <ConsentSettings />
        </footer>
        <ConsentBanner />
        <Analytics />
      </body>
    </html>
  );
}
