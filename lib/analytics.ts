/**
 * Google Analytics 4 wiring, kept deliberately small.
 *
 * Two rules hold this together:
 *
 * 1. **Nothing loads unless `NEXT_PUBLIC_GA_ID` is set.** Dev servers, local
 *    builds and preview deploys stay clean, and the site works identically
 *    with analytics switched off.
 * 2. **Nothing is measured until the visitor says yes.** GA4 sets cookies, so
 *    Consent Mode v2 is initialised with every signal denied and only updated
 *    once a choice is recorded. See `components/analytics/ConsentBanner.tsx`.
 */

/** GA4 measurement ID (`G-XXXXXXXXXX`), or `undefined` when not configured. */
export const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_ID || undefined;

export const analyticsEnabled = Boolean(GA_MEASUREMENT_ID);

export type ConsentChoice = "granted" | "denied";

/**
 * localStorage, not a cookie: the choice itself must not need consent, and a
 * static export has no server that could read a cookie anyway.
 */
export const CONSENT_KEY = "hanzi-garden:analytics-consent";

/** Broadcast so every mounted listener reacts to a choice in the same tick. */
export const CONSENT_EVENT = "hanzi-garden:consent-change";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Subscribe to consent changes — this tab (via `CONSENT_EVENT`) and any other
 * tab of the same site (via `storage`). Shaped for `useSyncExternalStore`.
 */
export function subscribeConsent(onChange: () => void): () => void {
  window.addEventListener(CONSENT_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CONSENT_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function readConsent(): ConsentChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(CONSENT_KEY);
    return stored === "granted" || stored === "denied" ? stored : null;
  } catch {
    // Private browsing, or storage disabled. Treat as "not asked yet"; the
    // banner will simply reappear next visit, which is the safe direction.
    return null;
  }
}

export function writeConsent(choice: ConsentChoice): void {
  try {
    window.localStorage.setItem(CONSENT_KEY, choice);
  } catch {
    // Non-fatal: the in-memory update below still applies for this session.
  }
  // No direct `applyConsent` here: the listener in <Analytics> reacts to this
  // event, and pushing from both places would double every consent update.
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: choice }));
}

/**
 * Forget the stored choice, so the banner asks again.
 *
 * Measurement is denied immediately rather than at the next answer: consent
 * has to be as easy to withdraw as it was to give, and "withdrawn" must mean
 * "stopped now".
 */
export function clearConsent(): void {
  try {
    window.localStorage.removeItem(CONSENT_KEY);
  } catch {
    // Nothing was stored to begin with; the denial below still applies.
  }
  applyConsent("denied");
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: null }));
}

/** Push a Consent Mode v2 update. Safe to call before gtag.js has loaded. */
export function applyConsent(choice: ConsentChoice): void {
  if (typeof window === "undefined") return;
  window.gtag?.("consent", "update", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: choice,
  });
}

/**
 * Record a page view. The App Router navigates on the client, so gtag's own
 * automatic first-load page_view is the only one it would ever send.
 */
export function trackPageView(url: string): void {
  if (!GA_MEASUREMENT_ID) return;
  window.gtag?.("event", "page_view", {
    page_path: url,
    page_location: window.location.href,
    page_title: document.title,
  });
}

/** A custom event, for the games. No-ops when analytics is off or denied. */
export function trackEvent(name: string, params?: Record<string, unknown>): void {
  if (!GA_MEASUREMENT_ID) return;
  window.gtag?.("event", name, params);
}
