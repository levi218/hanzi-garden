"use client";

import Script from "next/script";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

import {
  GA_MEASUREMENT_ID,
  applyConsent,
  readConsent,
  subscribeConsent,
  trackPageView,
} from "@/lib/analytics";

/**
 * Loads gtag.js and reports client-side navigations.
 *
 * The Consent Mode defaults this depends on are emitted separately, and
 * earlier, by `ConsentBootstrap` — see the note there. Renders nothing when
 * `NEXT_PUBLIC_GA_ID` is unset, which is the case for `next dev` and any build
 * that has not been given a measurement ID.
 */
export function Analytics() {
  if (!GA_MEASUREMENT_ID) return null;
  return <GoogleAnalytics measurementId={GA_MEASUREMENT_ID} />;
}

function GoogleAnalytics({ measurementId }: { measurementId: string }) {
  const pathname = usePathname();

  // gtag's `config` call fires its own page_view for the landing page; sending
  // ours as well would double-count it.
  const firstLoad = useRef(true);

  useEffect(() => {
    if (firstLoad.current) {
      firstLoad.current = false;
      return;
    }
    trackPageView(pathname);
  }, [pathname]);

  // Apply the choice whenever it changes — in the banner, or in another tab —
  // so accepting starts measurement now rather than on the next page load.
  useEffect(
    () =>
      subscribeConsent(() => {
        const choice = readConsent();
        if (choice) applyConsent(choice);
      }),
    [],
  );

  return (
    <Script
      id="ga-script"
      strategy="afterInteractive"
      src={`https://www.googletagmanager.com/gtag/js?id=${measurementId}`}
    />
  );
}
