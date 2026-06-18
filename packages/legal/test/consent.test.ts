import { describe, expect, it } from "vitest";

import {
  defaultLegalConfig,
  defaultSubProcessors,
  resolveLegalConfig,
} from "../src/config";
import {
  CONSENT_COOKIE_NAME,
  CONSENT_VERSION,
  hasConsent,
  makeConsentState,
  parseConsent,
  readConsentFromCookieString,
  serializeConsent,
} from "../src/consent";

/**
 * Unit guards for the consent codec + config. These pin the contract the banner
 * and any future analytics gate depend on: opt-in defaults to denied, the
 * round-trip is stable, and tampered/old cookies read as "no decision".
 */

describe("config", () => {
  it("seeds the real US sub-processor (Turso) and is overridable", () => {
    expect(defaultSubProcessors.some((s) => s.name === "Turso")).toBe(true);
    expect(defaultSubProcessors[0]?.country).toBe("United States");
    const merged = resolveLegalConfig({ appName: "My MVP" });
    expect(merged.appName).toBe("My MVP");
    // unspecified fields fall back to defaults
    expect(merged.contactEmail).toBe(defaultLegalConfig.contactEmail);
  });
});

describe("consent codec", () => {
  it("accepted grants analytics + marketing; rejected denies them", () => {
    expect(makeConsentState("accepted").categories).toEqual({
      necessary: true,
      analytics: true,
      marketing: true,
    });
    expect(makeConsentState("rejected").categories).toEqual({
      necessary: true,
      analytics: false,
      marketing: false,
    });
  });

  it("round-trips through serialize/parse", () => {
    const state = makeConsentState("accepted", "2026-01-01T00:00:00.000Z");
    const parsed = parseConsent(serializeConsent(state));
    expect(parsed).toEqual(state);
  });

  it("treats missing / malformed / wrong-version values as no decision", () => {
    expect(parseConsent(undefined)).toBeUndefined();
    expect(parseConsent("not-json")).toBeUndefined();
    expect(
      parseConsent(
        encodeURIComponent(
          JSON.stringify({ version: CONSENT_VERSION + 99, status: "accepted" }),
        ),
      ),
    ).toBeUndefined();
  });

  it("reads the value out of a document.cookie-style string", () => {
    const state = makeConsentState("accepted");
    const cookieString = `foo=bar; ${CONSENT_COOKIE_NAME}=${serializeConsent(
      state,
    )}; baz=qux`;
    expect(readConsentFromCookieString(cookieString)?.status).toBe("accepted");
    expect(readConsentFromCookieString("foo=bar")).toBeUndefined();
  });

  it("hasConsent: necessary always true; others require an accept", () => {
    const accepted = makeConsentState("accepted");
    const rejected = makeConsentState("rejected");
    expect(hasConsent(undefined, "necessary")).toBe(true);
    expect(hasConsent(undefined, "analytics")).toBe(false);
    expect(hasConsent(rejected, "analytics")).toBe(false);
    expect(hasConsent(accepted, "analytics")).toBe(true);
  });
});
