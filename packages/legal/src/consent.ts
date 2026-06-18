/**
 * @repo/legal — cookie-consent state: the pure, framework-agnostic codec.
 *
 * Consent is OPT-IN: until the user actively accepts, the stored state is
 * `undefined` and any non-essential category (analytics, marketing) must be
 * treated as DENIED. This module is the single source of truth for the cookie
 * name, the serialised shape, and how to read it — so the banner (client) and
 * server code (reading `cookies()`) agree, and future analytics can gate on one
 * helper.
 *
 * It deliberately imports nothing (no React, no Next), so it is safe to import
 * from a Server Component, a Route Handler, the proxy, or the client banner.
 */

/** Name of the cookie that stores the consent decision. */
export const CONSENT_COOKIE_NAME = "cookie_consent";

/** Days the consent decision is remembered before we ask again. */
export const CONSENT_MAX_AGE_DAYS = 180;

/** Schema version, so a future change to categories can invalidate old cookies. */
export const CONSENT_VERSION = 1;

/**
 * The consent categories. `necessary` is always granted (strictly-required
 * cookies — auth/session/CSRF — are exempt from opt-in under GDPR/ePrivacy);
 * the rest are denied until the user opts in.
 */
export type ConsentCategories = {
  /** Strictly necessary (auth, security). Always `true`. */
  readonly necessary: true;
  /** Product analytics / performance measurement. */
  readonly analytics: boolean;
  /** Marketing / advertising. */
  readonly marketing: boolean;
};

/** The persisted decision. */
export type ConsentState = {
  readonly version: number;
  /** `"accepted"` = opted into all; `"rejected"` = essential only; */
  readonly status: "accepted" | "rejected";
  readonly categories: ConsentCategories;
  /** ISO timestamp the decision was made. */
  readonly timestamp: string;
};

/** All non-essential categories denied — the pre-consent / rejected baseline. */
export const DENIED_CATEGORIES: ConsentCategories = {
  necessary: true,
  analytics: false,
  marketing: false,
};

/** All categories granted — the "Accept all" result. */
export const GRANTED_CATEGORIES: ConsentCategories = {
  necessary: true,
  analytics: true,
  marketing: true,
};

/** Build a fresh {@link ConsentState} for an accept/reject decision. */
export function makeConsentState(
  status: ConsentState["status"],
  timestamp: string = new Date().toISOString(),
): ConsentState {
  return {
    version: CONSENT_VERSION,
    status,
    categories: status === "accepted" ? GRANTED_CATEGORIES : DENIED_CATEGORIES,
    timestamp,
  };
}

/** Serialise a consent state into a cookie value (URI-encoded JSON). */
export function serializeConsent(state: ConsentState): string {
  return encodeURIComponent(JSON.stringify(state));
}

/**
 * Parse a single cookie value into a {@link ConsentState}. Returns `undefined`
 * for missing/malformed/old-version values, so callers treat "can't read a
 * valid current decision" the same as "no decision yet" (i.e. denied).
 */
export function parseConsent(
  value: string | undefined | null,
): ConsentState | undefined {
  if (!value) return undefined;
  try {
    const decoded = decodeURIComponent(value);
    const parsed = JSON.parse(decoded) as Partial<ConsentState>;
    if (
      parsed.version !== CONSENT_VERSION ||
      (parsed.status !== "accepted" && parsed.status !== "rejected") ||
      typeof parsed.categories !== "object" ||
      parsed.categories === null
    ) {
      return undefined;
    }
    return {
      version: CONSENT_VERSION,
      status: parsed.status,
      categories: {
        necessary: true,
        analytics: Boolean(parsed.categories.analytics),
        marketing: Boolean(parsed.categories.marketing),
      },
      timestamp:
        typeof parsed.timestamp === "string"
          ? parsed.timestamp
          : new Date(0).toISOString(),
    };
  } catch {
    return undefined;
  }
}

/**
 * Extract the consent state from a raw `Cookie` header / `document.cookie`
 * string (the `"a=1; b=2"` format). Server code is better served by reading the
 * value from `cookies().get(CONSENT_COOKIE_NAME)` and calling {@link parseConsent}
 * directly; this helper exists for the client hook and tests.
 */
export function readConsentFromCookieString(
  cookieString: string | undefined | null,
): ConsentState | undefined {
  if (!cookieString) return undefined;
  const prefix = `${CONSENT_COOKIE_NAME}=`;
  const match = cookieString
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  if (!match) return undefined;
  return parseConsent(match.slice(prefix.length));
}

/** Has the user granted a given non-essential category? Safe on `undefined`. */
export function hasConsent(
  state: ConsentState | undefined,
  category: keyof ConsentCategories,
): boolean {
  if (category === "necessary") return true;
  return state?.categories[category] === true;
}

/** The `Set-Cookie`-style attributes the banner uses when writing the cookie. */
export function consentCookieAttributes(): {
  readonly maxAge: number;
  readonly path: string;
  readonly sameSite: "lax";
} {
  return {
    maxAge: CONSENT_MAX_AGE_DAYS * 24 * 60 * 60,
    path: "/",
    sameSite: "lax",
  };
}
