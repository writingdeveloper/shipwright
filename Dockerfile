# syntax=docker/dockerfile:1

# Production image for apps/web, built from the monorepo root:
#
#   docker build -t shipwright-web .
#   docker run --rm -p 3000:3000 --env-file apps/web/.env shipwright-web
#
# Strategy: a multi-stage build around Next.js standalone output
# (`output: "standalone"` + `outputFileTracingRoot` in apps/web/next.config.ts).
# `next build` traces exactly the runtime files into `.next/standalone`, so the
# final stage is a slim runner that needs NO `pnpm install` — it just copies the
# self-contained server. The build runs INSIDE the container (not copied from the
# host) so pnpm's per-platform symlinks + native deps (libSQL) resolve for Linux.
#
# Pinned to the repo's Node engine (>=20; we use 22) and pnpm (11.3.0).

# ---- base: shared Node + pnpm via Corepack -----------------------------------
FROM node:22-alpine AS base
# libc compat for any prebuilt native modules (e.g. libSQL) on Alpine/musl.
RUN apk add --no-cache libc6-compat
# Corepack ships the exact pnpm version from package.json's `packageManager`.
RUN corepack enable
WORKDIR /app

# ---- deps: install ONCE against the lockfile (cached unless manifests change) -
# Copy only the files that affect dependency resolution so this layer is reused
# across source-only edits. Every workspace manifest is needed for pnpm to build
# the dependency graph.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/web/package.json ./apps/web/
COPY packages/analytics/package.json ./packages/analytics/
COPY packages/auth/package.json ./packages/auth/
COPY packages/config/package.json ./packages/config/
COPY packages/create-shipwright/package.json ./packages/create-shipwright/
COPY packages/db/package.json ./packages/db/
COPY packages/email/package.json ./packages/email/
COPY packages/env/package.json ./packages/env/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/legal/package.json ./packages/legal/
COPY packages/observability/package.json ./packages/observability/
COPY packages/payments/package.json ./packages/payments/
COPY packages/security/package.json ./packages/security/
COPY packages/seo/package.json ./packages/seo/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/ui/package.json ./packages/ui/
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile

# ---- builder: copy source + build the standalone server ----------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Re-link the workspace's own node_modules (the package-local symlinks) without
# re-downloading; the store is already populated from the deps stage.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --offline
# Next telemetry off in CI/containers.
ENV NEXT_TELEMETRY_DISABLED=1
# Build-time env: SCHEMA-VALID PLACEHOLDERS only — never real secrets. They let
# @repo/env's Zod validation and the eager clients (libSQL, Better Auth) build
# cleanly. We deliberately do NOT set SKIP_ENV_VALIDATION: it also skips Zod
# DEFAULTS, leaving DATABASE_URL undefined and breaking the libSQL client during
# Next's page-data collection (same reasoning as CI). Real values are injected at
# RUN time via --env-file / -e and read by the server at startup.
ENV BETTER_AUTH_SECRET=build-time-placeholder-not-a-real-secret-0123456789 \
    BETTER_AUTH_URL=http://localhost:3000 \
    DATABASE_URL=file:local.db
# Build only the web app (and its workspace deps) — not the create-shipwright
# CLI — so the image stays focused. Turbo resolves the @repo/* deps via ^build.
RUN pnpm build --filter=web

# ---- runner: slim production image -------------------------------------------
FROM base AS runner
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
# Run as a non-root user.
RUN addgroup --system --gid 1001 nodejs \
    && adduser --system --uid 1001 nextjs

# Standalone output preserves the monorepo layout because outputFileTracingRoot
# is the repo root: the server entry is at apps/web/server.js, with the traced
# node_modules at the bundle root. Copy the three pieces Next documents for a
# standalone deploy: the server bundle, the static assets, and public/.
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public

USER nextjs
EXPOSE 3000

# server.js is emitted by Next at the app's path inside the standalone bundle.
# HOSTNAME=0.0.0.0 makes it listen on all interfaces (required in containers).
CMD ["node", "apps/web/server.js"]
