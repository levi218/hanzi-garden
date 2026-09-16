import { CONSENT_KEY, GA_MEASUREMENT_ID } from "@/lib/analytics";

/**
 * Consent Mode v2 defaults, inlined into the prerendered HTML.
 *
 * A server component on purpose. `next/script` injects `afterInteractive`
 * inline scripts from the client after hydration, with no ordering guarantee
 * against the gtag.js tag — and these defaults are worthless unless they are
 * already queued when gtag.js starts. Emitting a plain <script> puts them in
 * the static markup, where they run first by construction.
 *
 * Everything starts denied. A stored "granted" is replayed here so a returning
 * visitor who already accepted is measured from their very first hit rather
 * than from the second one.
 */
export function ConsentBootstrap() {
  if (!GA_MEASUREMENT_ID) return null;

  const bootstrap = `
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
window.gtag = gtag;
gtag('consent', 'default', {
  ad_storage: 'denied',
  ad_user_data: 'denied',
  ad_personalization: 'denied',
  analytics_storage: 'denied',
  wait_for_update: 500
});
try {
  if (localStorage.getItem(${JSON.stringify(CONSENT_KEY)}) === 'granted') {
    gtag('consent', 'update', { analytics_storage: 'granted' });
  }
} catch (e) {}
gtag('js', new Date());
gtag('config', ${JSON.stringify(GA_MEASUREMENT_ID)}, { anonymize_ip: true });
`.trim();

  // Author-controlled string built from a build-time constant.
  return <script id="ga-consent-default" dangerouslySetInnerHTML={{ __html: bootstrap }} />;
}
