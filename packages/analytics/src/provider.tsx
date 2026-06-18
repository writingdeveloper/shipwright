"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PostHog } from "posthog-js";
import { useConsent } from "@repo/legal/cookie-consent";

import { analyticsHost, analyticsKey, isAnalyticsEnabled } from "./config";

/**
 * @repo/analytics — the consent-gated PostHog provider.
 *
 * Two hard guarantees, both required by the repo:
 *
 * 1. NO-OP WITHOUT A KEY. If `NEXT_PUBLIC_POSTHOG_KEY` is unset, this renders
 *    `children` and does NOTHING else — posthog-js is never even imported. So in
 *    tests/CI/local dev with no key it is a transparent pass-through and the e2e
 *    journey is unaffected.
 *
 * 2. CONSENT-GATED EVEN WITH A KEY. Tracking is opt-in: posthog is initialised
 *    (and only then) AFTER the user accepts cookies, read via `@repo/legal`'s
 *    `useConsent().hasAnalyticsConsent`. Before consent — or after a "reject" —
 *    nothing is loaded or captured. If consent is later granted in the same
 *    session we initialise then; this provider does not auto-revoke a live
 *    posthog instance (a full opt-out/reset on withdrawal can be layered on top
 *    via `posthog.opt_out_capturing()` if a product needs it).
 *
 * posthog-js is loaded with a DYNAMIC import inside the effect so it is only
 * pulled into the client bundle's execution when actually needed, and never on
 * the no-key path. The effect runs client-side only, so SSR is untouched (the
 * strict nonce CSP still applies — posthog opens XHR/fetch to the configured
 * host, whose origin the proxy adds to `connect-src` only when a key is set).
 */

type AnalyticsContextValue = {
  /** The live posthog client once initialised, else `undefined` (no-op). */
  readonly posthog: PostHog | undefined;
  /** Whether analytics is active (key present AND consent granted AND loaded). */
  readonly isReady: boolean;
};

const AnalyticsContext = createContext<AnalyticsContextValue>({
  posthog: undefined,
  isReady: false,
});

/** Read the analytics context (used by `useAnalytics`). */
export function useAnalyticsContext(): AnalyticsContextValue {
  return useContext(AnalyticsContext);
}

/** Props for {@link PostHogProvider}. */
export type PostHogProviderProps = {
  readonly children: ReactNode;
};

/**
 * Wrap the app in this once (e.g. in `app/layout.tsx`). It is always safe to
 * render: with no key it is inert, and with a key it still respects consent.
 */
export function PostHogProvider({ children }: PostHogProviderProps) {
  const { hasAnalyticsConsent } = useConsent();
  const [client, setClient] = useState<PostHog | undefined>(undefined);
  // Guard so we only ever init once, even across consent/re-render churn.
  const initStarted = useRef(false);

  useEffect(() => {
    // Gate 1: no key ⇒ complete no-op, never touch posthog-js.
    if (!isAnalyticsEnabled()) return;
    // Gate 2: no analytics consent yet ⇒ do not initialise or capture.
    if (!hasAnalyticsConsent) return;
    // Already initialising/initialised ⇒ nothing to do.
    if (initStarted.current) return;

    const key = analyticsKey();
    if (!key) return;

    initStarted.current = true;
    let cancelled = false;

    // Dynamic import keeps posthog-js out of the no-key execution path.
    void import("posthog-js").then(({ default: posthog }) => {
      if (cancelled) return;
      posthog.init(key, {
        api_host: analyticsHost(),
        // We have already obtained consent before reaching here, so capture is
        // allowed immediately; we still disable posthog's own cookie until
        // consent exists by virtue of only initialising post-consent.
        capture_pageview: true,
        capture_pageleave: true,
        // Respect Do-Not-Track as a courtesy on top of explicit consent.
        respect_dnt: true,
      });
      setClient(posthog);
    });

    return () => {
      cancelled = true;
    };
  }, [hasAnalyticsConsent]);

  return (
    <AnalyticsContext.Provider
      value={{ posthog: client, isReady: client !== undefined }}
    >
      {children}
    </AnalyticsContext.Provider>
  );
}

export default PostHogProvider;
