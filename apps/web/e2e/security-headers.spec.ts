import { expect, test } from "./fixtures";

/**
 * Security-headers proof against the REAL production server (see
 * playwright.config.ts). This asserts that the response actually carries the
 * static security headers AND a strict, nonce-based Content-Security-Policy —
 * and, crucially, that the app still loads and hydrates under that CSP (the
 * separate user-journey spec exercises sign-up → tasks → sign-out, all of which
 * depend on Next's scripts and Server Actions running, which `'strict-dynamic'`
 * would block if the nonce weren't propagated correctly).
 */

test("response carries the security headers and a strict nonce CSP", async ({
  page,
}) => {
  const response = await page.goto("/sign-in");
  expect(response, "navigation should return a response").not.toBeNull();

  const headers = response!.headers();

  // Static hardening headers (from next.config.ts headers()).
  expect(headers["x-frame-options"]).toBe("DENY");
  expect(headers["x-content-type-options"]).toBe("nosniff");
  expect(headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(headers["permissions-policy"]).toContain("camera=()");
  expect(headers["strict-transport-security"]).toContain("max-age=");

  // Nonce-based CSP (from proxy.ts).
  const csp = headers["content-security-policy"];
  if (!csp) throw new Error("CSP header must be present");

  // Strict: a fresh per-request nonce + strict-dynamic on scripts, and NO
  // production script/eval escape hatches. `'unsafe-inline'` is permitted ONLY
  // on `style-src-attr` (inline style ATTRIBUTES, which a nonce cannot cover) —
  // never on `script-src` or the `style-src` element directive.
  const directiveOf = (name: string) =>
    csp.split(";").find((d) => d.trim().startsWith(`${name} `)) ?? "";

  const scriptSrc = directiveOf("script-src");
  const styleSrc = directiveOf("style-src");

  expect(scriptSrc, "script-src must carry a nonce").toMatch(/'nonce-[^']+'/);
  expect(scriptSrc).toContain("'strict-dynamic'");
  expect(csp).not.toContain("'unsafe-eval'");
  expect(scriptSrc).not.toContain("'unsafe-inline'");
  expect(styleSrc).not.toContain("'unsafe-inline'");

  const nonceMatch = csp.match(/script-src [^;]*'nonce-([^']+)'/);
  expect(nonceMatch, "script-src must carry a nonce").not.toBeNull();

  // Core hardening directives.
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("base-uri 'self'");
  expect(csp).toContain("frame-ancestors 'none'");

  // The nonce in the CSP header is the one Next stamped onto its own scripts:
  // find it in the served HTML, proving propagation end-to-end.
  const nonce = nonceMatch![1];
  const html = await response!.text();
  expect(
    html.includes(`nonce="${nonce}"`),
    "Next should stamp the CSP nonce onto its scripts/styles",
  ).toBe(true);
});

test("each request gets a unique nonce", async ({ page }) => {
  const first = await page.goto("/sign-in");
  const second = await page.goto("/sign-up");

  const nonceOf = (csp: string | undefined) =>
    csp?.match(/'nonce-([^']+)'/)?.[1];

  const a = nonceOf(first!.headers()["content-security-policy"]);
  const b = nonceOf(second!.headers()["content-security-policy"]);

  expect(a).toBeTruthy();
  expect(b).toBeTruthy();
  expect(a).not.toBe(b);
});
