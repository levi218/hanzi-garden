"use client";

import { useSyncExternalStore } from "react";

import {
  analyticsEnabled,
  clearConsent,
  readConsent,
  subscribeConsent,
} from "@/lib/analytics";

/**
 * Footer control for changing an answer already given to the cookie notice.
 *
 * Shown only once a choice exists — before that the banner itself is on
 * screen, and a second control saying the same thing would just be noise.
 */
export function ConsentSettings() {
  const choice = useSyncExternalStore(subscribeConsent, readConsent, () => null);

  if (!analyticsEnabled || choice === null) return null;

  return (
    <p className="mt-2 text-[0.7rem] text-muted/80">
      Analytics cookies are{" "}
      <span className="text-foreground">
        {choice === "granted" ? "on" : "off"}
      </span>
      .{" "}
      <button
        type="button"
        onClick={clearConsent}
        className="underline underline-offset-2 transition hover:text-foreground"
      >
        Change this
      </button>
    </p>
  );
}
