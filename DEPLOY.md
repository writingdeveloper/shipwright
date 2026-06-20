# Deploying shipwright

shipwright is a Turborepo monorepo whose only deployable surface today is the
Next.js app at **`apps/web`** (App Router, Next 16, standalone output enabled).
This guide is **host-agnostic** — it covers three targets that need no
proprietary lock-in:

| Target | Best for | Status in this repo |
| --- | --- | --- |
| [Docker](#1-docker-coolify--vps--any-container-host) | Coolify, a VPS, Fly.io, Render, any container host | First-class — `Dockerfile` + `.dockerignore` ship here |
| [Vercel](#2-vercel) | Zero-config managed hosting | First-class — `vercel.json` ships here (mostly auto-detected) |
| [Cloudflare](#3-cloudflare-workers-opennext) | Edge / Workers | Documented path — `apps/web/wrangler.jsonc` stub + notes |

All three run the **same** app and need the **same** environment variables — see
[Environment variables](#environment-variables). Only the auth secret and a
database are strictly required; every integration (email, analytics, Sentry,
rate-limit Redis, Stripe) is optional and the app degrades gracefully when its
vars are absent.

> The build validates env with `@repo/env` (Zod) at build/startup, so a missing
> **required** var fails the build fast rather than 500-ing at runtime.

---

## Environment variables

Authoritative reference: **`apps/web/.env.example`** (every var is documented
there). Summary of what each deploy needs:

### Required (the app will not build/run without these)

| Var | What | Where to get it |
| --- | --- | --- |
| `BETTER_AUTH_SECRET` | Session signing secret, **>= 32 chars** | `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | The app's own public origin | e.g. `https://app.example.com` |
| `DATABASE_URL` | libSQL/SQLite connection | `file:local.db` locally; a `libsql://…` URL for [Turso](#database-turso--libsql) in prod |

### Required only for remote (Turso) DB

| Var | What |
| --- | --- |
| `DATABASE_AUTH_TOKEN` | Turso token (`turso db tokens create <db>`). Omit for a local `file:` DB. |

### Recommended in production

| Var | What |
| --- | --- |
| `NEXT_PUBLIC_APP_URL` | Canonical public origin used by `@repo/seo` for `metadataBase`, sitemap, robots, canonicals. Defaults to `http://localhost:3000`. |
| `NEXT_PUBLIC_BETTER_AUTH_URL` | Explicit base URL for the browser auth client. Leave unset for same-origin (correct for the default single-app deploy). |

### Optional integrations (each no-ops cleanly when unset)

| Feature | Vars | Behaviour when unset |
| --- | --- | --- |
| Email (Resend, `@repo/email`) | `RESEND_API_KEY`, `EMAIL_FROM` | Welcome email send no-ops (logs one warning); sign-up still works |
| Analytics (PostHog, `@repo/analytics`) | `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST` | posthog-js never loads; complete no-op |
| Errors/perf (Sentry, `@repo/observability`) | `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, and for source-map upload `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT`, optional `SENTRY_TRACES_SAMPLE_RATE` | SDK never initialises; build not instrumented; no upload |
| Rate-limit Redis (`@repo/security`) | `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` | Falls back to an in-memory sliding window (fine for a single instance; set both for multi-instance) |
| Billing (Stripe, `@repo/payments`) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_ID` (+ optional `NEXT_PUBLIC_STRIPE_PRICE_ID`) | Stripe client never constructed; upgrade button hidden; webhook route answers 503 |
| Web push (VAPID, `@repo/pwa`) | `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Push UI disabled ("Push not configured"); the server sender no-ops. Generate a keypair with `npx web-push generate-vapid-keys`. The manifest + service worker (install + offline) work without keys — only push needs them. |
| SEO verification (`@repo/seo`) | `NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION` | No `google-site-verification` meta tag emitted; the rest of SEO/GEO (sitemap, robots + AI crawlers, JSON-LD, llms.txt, OG image) works regardless. |
| Logger level | `LOG_LEVEL` (`debug`\|`info`\|`warn`\|`error`) | `debug` in dev, `info` in prod |

> **Multi-instance note.** If you run more than one replica (horizontal scaling),
> set the Upstash Redis vars so the rate-limit window is shared across instances.
> A single container/instance works fine on the in-memory default.

> **Email deliverability.** Before relying on transactional email, **verify your
> sending domain in Resend and add SPF + DKIM + DMARC DNS records.** Under 2026
> Gmail/Yahoo bulk-sender rules, mail from an unauthenticated domain is routed to
> spam — so welcome/reset emails silently fail without this. `EMAIL_FROM` must be
> on the verified domain; `sendEmail` also accepts a per-message `replyTo`.

> **Health check.** `GET /api/health` returns `200 {"status":"ok"}` (liveness, no
> DB dependency) — point your container platform's health probe at it.

---

## Database: Turso / libSQL

`@repo/db` is Drizzle over a libSQL client. The **same** client + `sqlite`
dialect drives both a local file and remote Turso — you only change env vars, no
code edits.

**Provision (once):**

```sh
turso db create shipwright-prod
turso db show shipwright-prod --url          # -> DATABASE_URL  (libsql://…)
turso db tokens create shipwright-prod       # -> DATABASE_AUTH_TOKEN
```

**Apply the schema to the prod DB** — run from the repo root with the prod env
exported, before (or as part of) your first deploy:

```sh
# Push the current Drizzle schema straight to the DB (simplest):
DATABASE_URL='libsql://…' DATABASE_AUTH_TOKEN='…' \
  pnpm --filter @repo/db db:push

# …or generate versioned SQL migrations and apply them:
pnpm --filter @repo/db db:generate          # writes packages/db/drizzle/*.sql
# then apply the generated SQL with your migration tool / `turso db shell`.
```

`db:push` is convenient for a starter; switch to `db:generate` + committed
migrations once you have real data to protect. `db:studio` opens a local GUI.

> Cloudflare Workers cannot open a local `file:` DB — you **must** use a remote
> Turso URL there (see [Cloudflare](#3-cloudflare-workers-opennext)).

---

## Stripe webhook

Billing is optional, but if you enable it you must register the webhook endpoint
so subscription state stays in sync. The route is:

```
POST  https://<your-app-origin>/api/stripe/webhook
```

1. Stripe Dashboard → **Developers → Webhooks → Add endpoint**, URL as above.
2. Copy the endpoint's **Signing secret** into `STRIPE_WEBHOOK_SECRET`.
3. Set `STRIPE_SECRET_KEY` and `STRIPE_PRICE_ID` (the recurring Price the upgrade
   button checks out).
4. Local testing: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
   and use the secret it prints.

The handler verifies the signature, dedupes by event id (idempotent), and
returns 2xx fast — per the repo's payment-webhook rules.

---

## 1. Docker (Coolify / VPS / any container host)

A production `Dockerfile` and `.dockerignore` ship at the repo root. The image
is a multi-stage build around **Next.js standalone output**
(`output: "standalone"` + `outputFileTracingRoot` set to the monorepo root in
`apps/web/next.config.ts`): `next build` traces only the runtime files into
`apps/web/.next/standalone`, so the final runner stage copies a self-contained
server and needs **no `pnpm install`**.

> The build runs **inside** the container (it is not copied from your host), so
> pnpm's per-platform symlinks and native deps (libSQL) resolve correctly for
> Linux regardless of your dev OS.

**Build & run:**

```sh
# from the repo root
docker build -t shipwright-web .

docker run --rm -p 3000:3000 \
  -e BETTER_AUTH_SECRET="$(openssl rand -base64 32)" \
  -e BETTER_AUTH_URL="https://app.example.com" \
  -e DATABASE_URL="libsql://your-db.turso.io" \
  -e DATABASE_AUTH_TOKEN="your-turso-token" \
  shipwright-web
```

or, simplest, point it at a file of real values (keep it out of git):

```sh
docker run --rm -p 3000:3000 --env-file apps/web/.env.production shipwright-web
```

The container listens on `0.0.0.0:3000` (`PORT` / `HOSTNAME` are overridable env
vars) and runs as a non-root `nextjs` user.

**Build-time vs run-time env.** The Dockerfile sets only **schema-valid
placeholders** at build time (so `@repo/env` validation and the eager libSQL /
Better Auth clients construct during `next build`). It deliberately does **not**
set `SKIP_ENV_VALIDATION` — that also skips Zod defaults and would leave
`DATABASE_URL` undefined, breaking the libSQL client during Next's page-data
collection. Your **real** secrets are supplied at `docker run` time and read by
the server at startup. Never bake secrets into the image.

**Coolify.** Point a new resource at this repo, choose the **Dockerfile** build
pack (root `Dockerfile`), set the env vars from the table above in the Coolify
UI, expose port `3000`, and deploy. Run `pnpm --filter @repo/db db:push` against
your Turso DB once before the first deploy (see [Database](#database-turso--libsql)).

**Other container hosts** (Fly.io, Render, Railway, a bare VPS with
`docker compose`) all consume the same image — supply the env vars however that
platform injects them and map a port to `3000`.

---

## 2. Vercel

Vercel **auto-detects** Turborepo + Next.js, so configuration is minimal. A small
`vercel.json` ships at the repo root pinning the framework and the
Turbo-filtered build:

```jsonc
{
  "framework": "nextjs",
  "installCommand": "pnpm install --frozen-lockfile",
  "buildCommand": "turbo run build --filter=web"
}
```

**Project settings (one-time):**

- **Root Directory:** `apps/web` (Vercel detects the monorepo; set this if it
  asks, or leave the repo root and let the `buildCommand` above filter).
- **Framework Preset:** Next.js (auto).
- **Install/Build commands:** taken from `vercel.json` above (override in the UI
  only if you must).
- **Environment Variables:** add every var your deploy needs (table above) for
  the Production/Preview/Development scopes. At minimum `BETTER_AUTH_SECRET`,
  `BETTER_AUTH_URL` (your `*.vercel.app` or custom domain), `DATABASE_URL`, and
  (for Turso) `DATABASE_AUTH_TOKEN`.

`output: "standalone"` is harmless on Vercel — the platform uses its own build
output and ignores it. Run the [DB schema push](#database-turso--libsql) against
your prod Turso DB once, and register the [Stripe webhook](#stripe-webhook) at
`https://<deployment>/api/stripe/webhook` if billing is on.

---

## 3. Cloudflare (Workers, OpenNext)

This is a **documented, opt-in** path — shipwright does not ship a wired
Cloudflare build (the Docker and Vercel targets are the tested ones). A stub
`apps/web/wrangler.jsonc` is included with inline instructions.

The supported route is the **OpenNext Cloudflare adapter**
([`@opennextjs/cloudflare`](https://opennext.js.org/cloudflare)), which compiles
the Next app to a Worker. Outline:

```sh
# in apps/web
pnpm add -D @opennextjs/cloudflare wrangler
# add an open-next.config.ts per the OpenNext docs, then:
pnpm exec opennextjs-cloudflare build
pnpm exec opennextjs-cloudflare deploy        # wraps `wrangler deploy`
```

**Caveats (why it's documented, not wired):**

- **Database:** the libSQL driver in `@repo/db` uses Node APIs. On Workers you
  must use a **remote Turso URL over HTTP** with the `nodejs_compat` flag (set in
  the stub), or swap `@repo/db` for a Workers-native HTTP driver. A local `file:`
  DB cannot run on the edge.
- **Secrets:** set each runtime secret with `wrangler secret put <NAME>` (do not
  put secrets in `vars`). Use the same variable names as the table above.
- **Node compatibility:** keep `compatibility_flags: ["nodejs_compat"]` and a
  recent `compatibility_date` (both in the stub).

If you only need a CDN/edge in front of the app, fronting the [Docker](#1-docker-coolify--vps--any-container-host)
deployment with Cloudflare (proxied DNS) is simpler than porting to Workers.

---

## Pre-deploy checklist

- [ ] `BETTER_AUTH_SECRET` (>= 32 chars), `BETTER_AUTH_URL`, `DATABASE_URL`
      (+ `DATABASE_AUTH_TOKEN` for Turso) set on the host.
- [ ] Schema applied to the prod DB (`pnpm --filter @repo/db db:push`).
- [ ] `NEXT_PUBLIC_APP_URL` set to the real origin (SEO/canonical URLs).
- [ ] Any optional integrations you want enabled have **all** their vars set.
- [ ] Stripe webhook registered at `/api/stripe/webhook` (if billing is on).
- [ ] `pnpm build` is green locally and CI passes.
