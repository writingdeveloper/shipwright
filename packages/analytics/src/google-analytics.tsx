"use client";

import { useEffect, useRef } from "react";
import { useConsent } from "@repo/legal/cookie-consent";

import { googleAnalyticsId, isGoogleAnalyticsEnabled } from "./config";

/**
 * @repo/analytics — consent-gated GA4 (coexists with PostHog).
 *
 * Two guarantees, mirroring the PostHog provider:
 * 1. NO-OP WITHOUT A KEY. With no `NEXT_PUBLIC_GA_ID`, gtag.js is never loaded.
 * 2. CONSENT-GATED. Even with a key, gtag loads ONLY after the user accepts
 *    analytics cookies (`@repo/legal`'s `useConsent`). We load post-consent, so
 *    `analytics_storage` is granted immediately.
 *
 * Mount once (e.g. in `app/layout.tsx`) alongside `<PostHogProvider>`.
 */
export function GoogleAnalytics(): null {
  const { hasAnalyticsConsent } = useConsent();
  const loaded = useRef(false);

  useEffect(() => {
    if (!isGoogleAnalyticsEnabled()) return;
    if (!hasAnalyticsConsent) return;
    if (loaded.current) return;
    const id = googleAnalyticsId();
    if (!id) return;

    loaded.current = true;

    const script = document.createElement("script");
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
    document.head.appendChild(script);

    const w = window as unknown as {
      dataLayer?: unknown[];
      gtag?: (...args: unknown[]) => void;
    };
    w.dataLayer = w.dataLayer ?? [];
    const gtag = (...args: unknown[]) => {
      w.dataLayer!.push(args);
    };
    w.gtag = gtag;
    gtag("js", new Date());
    // Reached only AFTER consent, so analytics storage is granted.
    gtag("consent", "update", { analytics_storage: "granted" });
    gtag("config", id);
  }, [hasAnalyticsConsent]);

  return null;
}

export default GoogleAnalytics;
