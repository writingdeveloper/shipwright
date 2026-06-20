import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

/**
 * Centralised, type-safe environment schema for shipwright.
 *
 * Validation schemas live in the package that owns the variables and each app
 * composes them in a root `env.ts` (the repo's Env rule). Today every secret is
 * owned by `@repo/auth` / `@repo/db`, so the single source of truth lives here
 * and those packages import the parsed `env` instead of reaching into
 * `process.env`. As new packages introduce their own vars, give each its own
 * schema and merge with t3-env's `extends`.
 *
 * Behaviour:
 * - Parsed once at module load; a missing/invalid required var throws a clear,
 *   aggregated error *before* the app serves a request (fail fast, not at the
 *   first 500).
 * - `SKIP_ENV_VALIDATION` bypasses parsing so a build/CI step without real
 *   secrets (e.g. `next build` for type-checking) doesn't fail. NEVER set it
 *   where the app actually runs.
 * - `emptyStringAsUndefined` treats `FOO=` in a `.env` file as "unset", so an
 *   empty line falls through to a default / required error instead of silently
 *   passing an empty string.
 */
export const env = createEnv({
  /**
   * Server-only variables. Accessing any of these from client code is a
   * compile-time error via t3-env.
   */
  server: {
    // Better Auth signing secret. Better Auth itself rejects short secrets;
    // we mirror that as a 32-char floor with an actionable message.
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "BETTER_AUTH_SECRET must be at least 32 characters."),
    // Canonical origin Better Auth issues/validates callbacks against.
    BETTER_AUTH_URL: z.string().url(),
    // libSQL connection string. Defaults to a local file so a fresh clone runs
    // with zero config; override for Turso/remote libSQL.
    DATABASE_URL: z.string().min(1).default("file:local.db"),
    // Optional auth token for remote libSQL (Turso). Unset for local files.
    DATABASE_AUTH_TOKEN: z.string().optional(),
    // Resend API key for transactional email (owned by `@repo/email`). OPTIONAL:
    // when unset, `@repo/email`'s helper no-ops (logs once, returns a skipped
    // result) instead of throwing, so the app/tests/CI run with no email account.
    RESEND_API_KEY: z.string().optional(),
    // The `From` address Resend sends as (e.g. "Acme <noreply@acme.com>").
    // OPTIONAL and paired with RESEND_API_KEY — if either is missing the send
    // no-ops. Validated as a non-empty string (Resend accepts a bare address or
    // a "Name <addr>" form, so we don't over-constrain it to a plain email).
    EMAIL_FROM: z.string().min(1).optional(),
    // Sentry error monitoring (owned by `@repo/observability`). ALL OPTIONAL:
    // with no DSN the SDK never initialises, `withSentryConfig` leaves the build
    // untouched, and the CSP is not broadened — so the app/tests/CI run with no
    // Sentry account. Server-side DSN (the server may use either this or the
    // public one).
    SENTRY_DSN: z.string().optional(),
    // Source-map upload credentials, used by `withSentryConfig` at BUILD time
    // only. OPTIONAL: without all of token/org/project the build still succeeds,
    // it just skips uploading source maps (no auth attempt, no failure).
    SENTRY_AUTH_TOKEN: z.string().optional(),
    SENTRY_ORG: z.string().optional(),
    SENTRY_PROJECT: z.string().optional(),
    // Optional traces sample rate (0..1) as a string env; defaults to 0.1.
    SENTRY_TRACES_SAMPLE_RATE: z.string().optional(),
    // Upstash Redis REST credentials for the DISTRIBUTED rate-limit backend
    // (owned by `@repo/security`). OPTIONAL and paired: with BOTH set the limiter
    // uses Upstash so the window is shared across instances; with either missing
    // it falls back to the dependency-free in-memory limiter, so dev/CI/tests and
    // a fresh clone rate-limit with no keys.
    UPSTASH_REDIS_REST_URL: z.string().url().optional(),
    UPSTASH_REDIS_REST_TOKEN: z.string().optional(),
    // Stripe billing (owned by `@repo/payments`). ALL OPTIONAL: with no secret
    // key the package NEVER constructs a Stripe client — `createCheckoutSession`
    // returns `{ configured: false }` and the webhook route answers 503 — so the
    // app, tests, and CI run with no Stripe account and the dashboard hides the
    // upgrade button instead of redirecting off-site.
    // Secret API key (`sk_...`); gates whether billing is configured at all.
    STRIPE_SECRET_KEY: z.string().optional(),
    // Webhook signing secret (`whsec_...`) used to verify the `Stripe-Signature`
    // header. Without it the webhook route refuses to trust any payload (503).
    STRIPE_WEBHOOK_SECRET: z.string().optional(),
    // The recurring Price the "Upgrade to Pro" button checks out (`price_...`).
    // Server-side fallback for the public var below so it can stay a secret if
    // preferred; either one enables the button.
    STRIPE_PRICE_ID: z.string().optional(),
    // Web Push / VAPID (owned by `@repo/pwa`). ALL OPTIONAL: with no
    // VAPID_PRIVATE_KEY the push sender no-ops (returns `{ skipped: true }`,
    // warns once) and the dashboard push toggle shows a disabled state — so the
    // app/tests/CI run with no push keys. Generate a keypair with
    // `npx web-push generate-vapid-keys`. The PRIVATE key signs pushes server-side.
    VAPID_PRIVATE_KEY: z.string().optional(),
    // Contact URI sent to push services in the VAPID JWT (a `mailto:` or https
    // URL). Defaults to a mailto in the sender if unset.
    VAPID_SUBJECT: z.string().optional(),
  },

  /**
   * Client-exposed variables. Must be prefixed `NEXT_PUBLIC_` and are inlined
   * into the browser bundle, so never put a secret here.
   */
  client: {
    // Optional explicit base URL for the browser auth client. When unset the
    // client falls back to same-origin, which is correct for the default
    // single-app deployment.
    NEXT_PUBLIC_BETTER_AUTH_URL: z.string().url().optional(),
    // Optional canonical public origin of the app (e.g. https://example.com),
    // used by `@repo/seo` as the SEO `metadataBase` and to build absolute
    // sitemap/robots/canonical URLs. Optional so a fresh clone runs with no
    // config; consumers default it to http://localhost:3000.
    NEXT_PUBLIC_APP_URL: z.string().url().optional(),
    // PostHog project API key for product analytics (owned by `@repo/analytics`).
    // OPTIONAL: when unset, `@repo/analytics`'s `PostHogProvider` is a complete
    // no-op (it never loads posthog-js), so the app/tests/CI run with no
    // analytics account. Even WHEN set, capture is gated on cookie consent.
    NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
    // PostHog ingestion host (e.g. https://us.i.posthog.com or a reverse-proxy
    // path). OPTIONAL; consumers default it to the US cloud. Its origin is added
    // to the CSP `connect-src` ONLY when a key is also set (see proxy.ts).
    NEXT_PUBLIC_POSTHOG_HOST: z.string().url().optional(),
    // Browser-visible Sentry DSN (owned by `@repo/observability`). OPTIONAL: with
    // no DSN the browser SDK never initialises and the CSP `connect-src` is not
    // broadened. The browser can only ever see this public var, never SENTRY_DSN.
    NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
    // Public Stripe Price id (`price_...`) for the "Upgrade to Pro" button
    // (owned by `@repo/payments`). OPTIONAL: a price id is not a secret, so it
    // may live here for client-side use; the server reads `STRIPE_PRICE_ID` or
    // falls back to this. With neither set (and/or no secret key) the upgrade
    // button is hidden, so the keyless app/tests/CI never start a checkout.
    NEXT_PUBLIC_STRIPE_PRICE_ID: z.string().optional(),
    // Public VAPID key (owned by `@repo/pwa`). OPTIONAL and NOT a secret — the
    // browser needs it to subscribe to push. With it unset, push subscription is
    // disabled in the UI and the package no-ops. Pair with VAPID_PRIVATE_KEY.
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: z.string().optional(),
    // Google Search Console site verification token (consumed by `@repo/seo`'s
    // createMetadata). OPTIONAL: when set, emits the `google-site-verification`
    // meta tag; unset ⇒ no tag (no-op).
    NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION: z.string().optional(),
  },

  /**
   * Next.js inlines `NEXT_PUBLIC_*` at build time, so client vars must be
   * destructured explicitly from `process.env` (a bare `process.env` is not
   * statically analysable). Server vars are read from `process.env` directly.
   */
  runtimeEnv: {
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    DATABASE_URL: process.env.DATABASE_URL,
    DATABASE_AUTH_TOKEN: process.env.DATABASE_AUTH_TOKEN,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    SENTRY_DSN: process.env.SENTRY_DSN,
    SENTRY_AUTH_TOKEN: process.env.SENTRY_AUTH_TOKEN,
    SENTRY_ORG: process.env.SENTRY_ORG,
    SENTRY_PROJECT: process.env.SENTRY_PROJECT,
    SENTRY_TRACES_SAMPLE_RATE: process.env.SENTRY_TRACES_SAMPLE_RATE,
    UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
    UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    STRIPE_WEBHOOK_SECRET: process.env.STRIPE_WEBHOOK_SECRET,
    STRIPE_PRICE_ID: process.env.STRIPE_PRICE_ID,
    NEXT_PUBLIC_BETTER_AUTH_URL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_STRIPE_PRICE_ID: process.env.NEXT_PUBLIC_STRIPE_PRICE_ID,
    VAPID_PRIVATE_KEY: process.env.VAPID_PRIVATE_KEY,
    VAPID_SUBJECT: process.env.VAPID_SUBJECT,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION:
      process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION,
  },

  /**
   * Skip parsing when explicitly opted out (CI builds, lint/type-only steps
   * that have no real secrets). Off by default so a normal run validates.
   */
  skipValidation:
    !!process.env.SKIP_ENV_VALIDATION &&
    process.env.SKIP_ENV_VALIDATION !== "false",

  /**
   * Treat empty strings (`FOO=`) as undefined so they hit defaults / required
   * checks rather than passing as a valid empty value.
   */
  emptyStringAsUndefined: true,
});
