"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@repo/ui/components/ui/button";

import {
  CONSENT_COOKIE_NAME,
  type ConsentState,
  consentCookieAttributes,
  makeConsentState,
  readConsentFromCookieString,
  serializeConsent,
} from "./consent";

/**
 * @repo/legal — opt-in cookie-consent banner + a hook to read consent.
 *
 * Behaviour & GDPR/CCPA/PIPA posture:
 * - OPT-IN: non-essential cookies stay denied until the user clicks "Accept".
 *   "Reject" (and dismiss) records an essential-only decision so we stop asking.
 * - Writes the decision to a first-party `lax` cookie (see `./consent`) that
 *   server code and the {@link useConsent} hook both read.
 * - NON-BLOCKING by construction (important for the app's e2e flow): the fixed
 *   wrapper spans only the bottom of the viewport and is `pointer-events:none`,
 *   so it never intercepts clicks meant for the page; only the banner card
 *   itself re-enables pointer events. It therefore cannot sit on top of, or
 *   swallow clicks to, centered auth forms or the tasks UI.
 *
 * Rendered by Next (inside the app tree), so the strict nonce CSP covers it —
 * no raw inline script is injected.
 */

/** Read `document.cookie` on the client; `undefined` during SSR. */
function readClientConsent(): ConsentState | undefined {
  if (typeof document === "undefined") return undefined;
  return readConsentFromCookieString(document.cookie);
}

/** Write the consent cookie from the client. */
function writeClientConsent(state: ConsentState): void {
  const { maxAge, path, sameSite } = consentCookieAttributes();
  const secure =
    typeof location !== "undefined" && location.protocol === "https:"
      ? "; Secure"
      : "";
  document.cookie =
    `${CONSENT_COOKIE_NAME}=${serializeConsent(state)}` +
    `; Max-Age=${maxAge}; Path=${path}; SameSite=${sameSite}${secure}`;
}

/**
 * Client hook exposing the current consent decision and setters. Future
 * analytics can do `const { hasAnalyticsConsent } = useConsent()` and only load
 * when it is `true`. Re-reads the cookie on mount (post-hydration) to avoid an
 * SSR/client mismatch.
 */
export function useConsent() {
  const [consent, setConsent] = useState<ConsentState | undefined>(undefined);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setConsent(readClientConsent());
    setHydrated(true);
  }, []);

  const decide = useCallback((status: ConsentState["status"]) => {
    const state = makeConsentState(status);
    writeClientConsent(state);
    setConsent(state);
  }, []);

  const accept = useCallback(() => decide("accepted"), [decide]);
  const reject = useCallback(() => decide("rejected"), [decide]);

  return {
    /** The stored decision, or `undefined` if none yet. */
    consent,
    /** `false` until the cookie has been read on the client. */
    hydrated,
    /** Whether a decision (accept or reject) has been recorded. */
    hasDecided: consent !== undefined,
    /** Gate for analytics — only `true` after an explicit accept. */
    hasAnalyticsConsent: consent?.categories.analytics === true,
    /** Gate for marketing cookies. */
    hasMarketingConsent: consent?.categories.marketing === true,
    accept,
    reject,
  };
}

/** Props for {@link CookieConsentBanner}. */
export type CookieConsentBannerProps = {
  /** App name, shown in the banner copy. */
  readonly appName?: string;
  /** Href of the privacy policy the banner links to. */
  readonly privacyHref?: string;
  /** Optional extra class names on the banner card. */
  readonly className?: string;
};

/**
 * The bottom-of-page consent strip. Renders nothing once a decision exists (or
 * before hydration, to avoid a flash / SSR mismatch).
 */
export function CookieConsentBanner({
  appName = "this app",
  privacyHref = "/privacy",
  className,
}: CookieConsentBannerProps) {
  const { hydrated, hasDecided, accept, reject } = useConsent();

  if (!hydrated || hasDecided) return null;

  return (
    // Bottom-only, click-through wrapper: it cannot cover or intercept the
    // page's interactive controls. Only the inner card takes pointer events.
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center p-4"
      role="region"
      aria-label="Cookie consent"
      data-testid="cookie-consent"
    >
      <div
        className={[
          "pointer-events-auto bg-card text-card-foreground border-border flex w-full max-w-3xl flex-col gap-3 rounded-xl border p-4 shadow-lg sm:flex-row sm:items-center sm:justify-between",
          className ?? "",
        ]
          .join(" ")
          .trim()}
      >
        <p className="text-muted-foreground text-sm">
          {appName} uses strictly necessary cookies to run, and optional cookies
          (e.g. analytics) only with your consent. See our{" "}
          <a href={privacyHref} className="text-primary hover:underline">
            Privacy Policy
          </a>
          .
        </p>
        <div className="flex shrink-0 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={reject}
            data-testid="cookie-consent-reject"
          >
            Reject non-essential
          </Button>
          <Button
            size="sm"
            onClick={accept}
            data-testid="cookie-consent-accept"
          >
            Accept all
          </Button>
        </div>
      </div>
    </div>
  );
}
