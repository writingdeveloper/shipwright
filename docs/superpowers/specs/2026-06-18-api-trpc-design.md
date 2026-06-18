# @repo/api (tRPC) — design spec

- **Date:** 2026-06-18
- **Status:** Approved (brainstorming) → ready for implementation plan
- **Roadmap item:** "Optional `@repo/api` (tRPC) — the app currently uses Server Actions"

## Context & goal

shipwright's API style is "Server Actions (tRPC optional)". This module adds tRPC
as an **opt-in additional layer** — it does NOT replace Server Actions. The
reference app keeps its Server-Action mutations and RSC `db` reads; tRPC is
introduced as the vetted pattern for **type-safe client-side queries** (TanStack
React Query), demonstrated by reading the signed-in user's tasks.

Unlike the integration packages, tRPC has no external key, so there is no
graceful-no-op concern — it is simply present and opt-in. Per the repo discipline,
`@repo/api` ships with a real consumer in `apps/web` (the dashboard tRPC demo).

**Goal:** A working tRPC v11 stack — server router with auth+db context, an App
Router fetch handler, and a TanStack React Query client — with `apps/web`'s
dashboard reading tasks through a `task.list` query, alongside the unchanged
Server-Action task CRUD.

## Key decisions (with rationale)

1. **tRPC v11 + the new `@trpc/tanstack-react-query` integration**, not the
   classic `@trpc/react-query`. v11 is current; the TanStack integration
   (`createTRPCContext` → `useTRPC` + `queryOptions`) is the recommended client
   pattern.
2. **Opt-in, coexisting with Server Actions.** Mutations stay Server Actions
   (Next's CSRF protection, progressive enhancement); tRPC demonstrates the
   client-query path. Same `task` data, two patterns, no duplication of behaviour.
3. **Provider scoped to the dashboard subtree**, not a global layout — the demo
   needs React Query only there, so other routes don't pay for it.
4. **`superjson` transformer** so `Date` fields (`task.createdAt`) round-trip.
5. **Relative `/api/trpc` URL** (same-origin) → the strict nonce CSP's
   `connect-src 'self'` already covers it; no CSP change.

## Package surface — `@repo/api`

Subpath exports (source-only, `tsc --noEmit`, transpiled by the app):

| Export | Symbols | Env |
|---|---|---|
| `.` | `appRouter`, `AppRouter` (type), `createTRPCContext`, `protectedProcedure`, `publicProcedure` | server-only |
| `./client` | `TRPCReactProvider`, `useTRPC` | client |

## Server (tRPC v11)

- `src/trpc.ts`: `initTRPC.context<Context>().create({ transformer: superjson })`;
  exports `router`, `publicProcedure`, and `protectedProcedure` (a middleware that
  throws `TRPCError({ code: "UNAUTHORIZED" })` when `ctx.session` is null and
  narrows `ctx.session` to non-null for downstream resolvers).
- `src/context.ts`: `createTRPCContext({ headers }: { headers: Headers })` returns
  `{ session, db }` — `session` from `@repo/auth`'s `auth.api.getSession({ headers })`,
  `db` from `@repo/db`.
- `src/routers/task.ts`: `taskRouter = router({ list: protectedProcedure.query(...) })`
  — owner-scoped read (`eq(task.userId, ctx.session.user.id)`, `desc(createdAt)`),
  the read-side mirror of the dashboard's existing RSC query.
- `src/root.ts`: `appRouter = router({ task: taskRouter })`; `export type AppRouter`.

## Client (TanStack React Query)

- `src/client.tsx` (`'use client'`): from `@trpc/tanstack-react-query`,
  `createTRPCContext<AppRouter>()` yields `{ TRPCProvider, useTRPC }`. A
  `TRPCReactProvider` component constructs a `QueryClient` (stable per browser),
  a tRPC client via `createTRPCClient({ links: [httpBatchLink({ url: "/api/trpc",
  transformer: superjson })] })`, and renders `QueryClientProvider` +
  `TRPCProvider`. Re-exports `useTRPC`.
- `src/query-client.ts`: `makeQueryClient()` factory (new on server, singleton in
  the browser) — standard Next App Router + React Query pattern.

## App handler (`apps/web/app/api/trpc/[trpc]/route.ts`)

`fetchRequestHandler({ endpoint: "/api/trpc", req, router: appRouter,
createContext: () => createTRPCContext({ headers: req.headers }) })`, exported as
both `GET` and `POST`.

## apps/web integration

- `app/dashboard/layout.tsx` (new): wraps the dashboard subtree in
  `<TRPCReactProvider>`.
- `app/dashboard/trpc-task-list.tsx` (new, `'use client'`): calls
  `useTRPC().task.list.queryOptions()` with `useQuery`, rendering a small "Tasks
  (via tRPC)" demo card. The existing RSC task list + Server-Action CRUD are
  unchanged.
- `next.config.ts`: add `@repo/api` to `transpilePackages`.

## Env / CSP

No new env. Same-origin `/api/trpc` is covered by `connect-src 'self'`; no CSP
change. (The handler lives under `/api/*`, which the proxy matcher already
excludes from the page-CSP pass — consistent with the other route handlers.)

## Testing

- **vitest** (`@repo/api`): `protectedProcedure` rejects an unauthenticated call —
  `appRouter.createCaller({ session: null, db })` → `task.list()` throws
  `UNAUTHORIZED`. `test/setup.ts` sets `SKIP_ENV_VALIDATION` (imports `@repo/env`
  via context). No real DB needed (the guard throws before any query).
- **e2e**: after sign-in, the dashboard's tRPC demo card lists the user's tasks
  (extends/*mirrors* the existing tasks journey).

## Dependencies

`@repo/api`: `@trpc/server`, `@trpc/client`, `@trpc/tanstack-react-query`,
`@tanstack/react-query`, `superjson`, `zod`, `@repo/auth`, `@repo/db`, `@repo/env`,
`next`, `react`; dev `@types/react`. `apps/web` gains `@repo/api` (+ peers already
present). `react` is a peer dependency.

## Acceptance criteria

1. `pnpm build`, `check-types`, `lint`, `test` pass.
2. `POST /api/trpc/task.list` returns the signed-in user's tasks; an
   unauthenticated call is rejected (`UNAUTHORIZED`).
3. The dashboard renders both the existing (RSC/Server-Action) task UI and the
   tRPC demo card; Server-Action create/toggle/delete still work.
4. CSP unchanged; no `unsafe-*` introduced.

## Out of scope (YAGNI)

- Migrating Server-Action mutations to tRPC (mutations stay Server Actions).
- Subscriptions / SSE / websockets.
- A global tRPC provider (dashboard subtree only).
- tRPC for any domain beyond `task` (the single demo proves the pattern).
