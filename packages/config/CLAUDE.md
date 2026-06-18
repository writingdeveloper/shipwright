# @repo/config — Claude Code rules

Shared production-hardening config: static security headers + nonce-based CSP helpers for the Next.js App Router. Pure string builders, no runtime deps.

- **Two import surfaces** (both also via subpath):
  - `@repo/config/headers` → `securityHeaders` (a `{ key, value }[]` for `next.config.ts`'s `headers()`). Request-independent headers only.
  - `@repo/config/csp` → `generateNonce()`, `buildContentSecurityPolicy({ nonce, isDev, connectSrc })`, `NONCE_HEADER` (`x-nonce`), `CONTENT_SECURITY_POLICY_HEADER`.
- **The CSP is NOT in `securityHeaders`** — it carries a per-request nonce and is set in the app's `proxy.ts`, never in `headers()`. Keep that split.
- **Wiring contract (the official Next nonce pattern)** — the consuming app's `proxy.ts` must, per request: mint a nonce, set it on the **request** headers as `x-nonce`, build the policy with that nonce, and set the `Content-Security-Policy` on **both** the forwarded request headers and the response. Next reads the header, extracts `'nonce-<v>'`, and stamps it onto its own scripts/styles. `apps/web/proxy.ts` is the reference; the matcher must skip `_next/static`, `_next/image`, `favicon.ico`, and prefetches.
- **Prod stays strict**: production `script-src`/`style-src` never get `'unsafe-eval'`/`'unsafe-inline'` (only `style-src-attr` gets `'unsafe-inline'`, which nonces can't cover). `isDev: true` adds the dev-only relaxations React's overlay needs — pass `process.env.NODE_ENV === "development"`.
- **Nonce ⇒ dynamic rendering**: pages carrying the nonce render per-request (no full static/PPR). That is inherent to nonce CSP, not a regression.
- Changing a directive? Update `test/csp.test.ts` (it pins the contract) and re-run `pnpm -C <repo> test:e2e` — the e2e suite is the real proof the policy still lets the app run.
