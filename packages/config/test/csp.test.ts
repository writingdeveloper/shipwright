import { describe, expect, it } from "vitest";

import {
  buildContentSecurityPolicy,
  generateNonce,
} from "../src/csp";
import { securityHeaders } from "../src/headers";

/**
 * Unit guards for the security config. These pin the contract the proxy and the
 * e2e suite depend on: the production policy is strict (no `'unsafe-*'` on
 * scripts), the nonce is propagated into script/style, and dev-only relaxations
 * never leak into production.
 */

describe("generateNonce", () => {
  it("returns a fresh, non-empty value each call", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe("");
    expect(a).not.toBe(b);
  });
});

describe("buildContentSecurityPolicy (production)", () => {
  const nonce = "TESTNONCE";
  const csp = buildContentSecurityPolicy({ nonce, isDev: false });

  it("puts the nonce + strict-dynamic on script-src and never unsafe-eval", () => {
    expect(csp).toContain(`script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`);
    expect(csp).not.toContain("'unsafe-eval'");
  });

  it("nonces styles and does not allow unsafe-inline on <style> in prod", () => {
    expect(csp).toContain(`style-src 'self' 'nonce-${nonce}'`);
    // The only unsafe-inline permitted is for style ATTRIBUTES, which nonces
    // cannot cover — never for <style>/script.
    expect(csp).toContain("style-src-attr 'unsafe-inline'");
    expect(csp).not.toContain("script-src 'self' 'nonce-" + nonce + "' 'strict-dynamic' 'unsafe-inline'");
  });

  it("includes the core hardening directives", () => {
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("worker-src 'self'");
    expect(csp).toContain("manifest-src 'self'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("defaults connect-src to self and appends extra origins", () => {
    expect(csp).toContain("connect-src 'self'");
    const withAuth = buildContentSecurityPolicy({
      nonce,
      connectSrc: ["https://auth.example.com"],
    });
    expect(withAuth).toContain("connect-src 'self' https://auth.example.com");
  });
});

describe("buildContentSecurityPolicy (development)", () => {
  const csp = buildContentSecurityPolicy({ nonce: "N", isDev: true });

  it("adds unsafe-eval for React's dev error overlay", () => {
    expect(csp).toContain("'unsafe-eval'");
  });

  it("adds unsafe-inline to style-src for the dev server's un-nonced styles", () => {
    expect(csp).toContain("style-src 'self' 'nonce-N' 'unsafe-inline'");
  });
});

describe("securityHeaders", () => {
  const byKey = Object.fromEntries(securityHeaders.map((h) => [h.key, h.value]));

  it("sets the expected static hardening headers", () => {
    expect(byKey["X-Frame-Options"]).toBe("DENY");
    expect(byKey["X-Content-Type-Options"]).toBe("nosniff");
    expect(byKey["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(byKey["Strict-Transport-Security"]).toContain("max-age=");
    expect(byKey["Permissions-Policy"]).toContain("camera=()");
  });

  it("does not include the CSP (that is per-request, set in the proxy)", () => {
    expect(byKey["Content-Security-Policy"]).toBeUndefined();
  });
});
