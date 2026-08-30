"use client";

import { useSyncExternalStore } from "react";

import {
  analyticsEnabled,
  readConsent,
  subscribeConsent,
  writeConsent,
} from "@/lib/analytics";

/**
 * Rendered during prerender and hydration, when the visitor's stored choice
 * cannot be known yet. Distinct from `null` — which means "asked, and they
 * have not answered" — so that the static HTML never ships a banner that a
 * returning visitor already dismissed.
 */
const UNKNOWN = "unknown";

/**
 * Cookie notice for GA4.
 *
 * The choice lives in localStorage, so it is read through
 * `useSyncExternalStore` rather than an effect: that is what keeps this tab,
 * other tabs, and the prerendered HTML in agreement about what to show.
 *
 * Nothing renders when analytics is unconfigured — with no measurement ID
 * there is nothing to consent to, and asking anyway would be theatre.
 */
export function ConsentBanner() {
  const choice = useSyncExternalStore(
    subscribeConsent,
    readConsent,
    () => UNKNOWN,
  );

  if (!analyticsEnabled || choice !== null) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie notice"
      aria-live="polite"
      className="fixed inset-x-0 bottom-0 z-50 px-4 pb-4 sm:px-6"
    >
      <div className="mx-auto flex max-w-3xl flex-col gap-3 rounded-2xl border border-line bg-card/95 px-5 py-4 shadow-lg backdrop-blur-md sm:flex-row sm:items-center sm:gap-5">
        <p className="flex-1 text-sm leading-relaxed text-muted">
          We&rsquo;d like to count visits with Google Analytics, to see which
          characters and games people actually use. It sets cookies.{" "}
          <span className="text-foreground">
            Your study progress never leaves this browser either way.
          </span>
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={() => writeConsent("denied")}
            className="rounded-full border border-line bg-card px-4 py-2 text-sm font-medium transition hover:border-foreground/30"
          >
            Decline
          </button>
          <button
            type="button"
            onClick={() => writeConsent("granted")}
            className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-85"
          >
            Accept
          </button>
        </div>
      </div>
    </div>
  );
}
