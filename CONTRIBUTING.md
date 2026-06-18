# Contributing to shipwright

Thanks for your interest! shipwright is built **in the open by dogfooding it on
real apps**. Contributions that strengthen that loop — better patterns extracted
from `apps/web`, fixes, docs — are very welcome. Please read the short guide
below first; it will save us both round-trips.

By participating you agree to abide by our
[Code of Conduct](./CODE_OF_CONDUCT.md).

## Prerequisites

- **Node.js ≥ 22** (the repo targets the Node 22 LTS line; `engines` requires ≥ 20).
- **pnpm 11** — the repo pins `packageManager: pnpm@11.3.0`. Enable it with
  [corepack](https://nodejs.org/api/corepack.html):

  ```sh
  corepack enable
  ```

## Setup

```sh
git clone https://github.com/writingdeveloper/shipwright.git
cd shipwright
pnpm install

# Configure the reference app (see apps/web/README.md for details):
cp apps/web/.env.example apps/web/.env   # set BETTER_AUTH_SECRET (>= 32 chars)
pnpm --filter @repo/db db:push           # create the local libSQL database
pnpm dev --filter=web                    # http://localhost:3000
```

## Scripts

Run these from the repo root (Turborepo fans them out across the workspace):

| Command | What it does |
| --- | --- |
| `pnpm dev` | Run all `dev` tasks (filter with `--filter=web`) |
| `pnpm build` | Production build of every package/app |
| `pnpm lint` | ESLint across the workspace (`--max-warnings 0`) |
| `pnpm check-types` | `tsc --noEmit` (and `next typegen`) everywhere |
| `pnpm test` | Vitest unit / data-layer suites |
| `pnpm test:e2e` | Playwright end-to-end against a real prod build (web) |
| `pnpm format` | Prettier write over `**/*.{ts,tsx,md}` |

For a secret-less build (e.g. quick type-check) use
`SKIP_ENV_VALIDATION=true pnpm build`.

## Conventions

- **TypeScript everywhere, strict.** No `any` escape hatches without a reason.
- **Internal packages** use the `@repo/*` namespace via `workspace:*` and
  compile with `tsc` (Turborepo caches outputs).
- **Env**: validation schemas live in the package that owns the vars
  (today `@repo/env`); each app composes them in a root `env.ts`. Never read
  `process.env` directly in app/feature code — import the typed `env`.
- **Auth/authz**: verify inside each Server Action and keep DB access in a
  `server-only` data layer — do **not** rely on middleware/layout/page checks
  alone. (See [`CLAUDE.md`](./CLAUDE.md) for the full architecture rules.)
- **Formatting/lint**: code must pass `pnpm lint`, `pnpm check-types`, and
  `pnpm format` before review.
- **Security overrides**: when pinning an advisory, mirror the override in
  **both** `package.json` (`pnpm.overrides`) and `pnpm-workspace.yaml`
  (`overrides`), and keep `pnpm audit` at 0.

## The discipline (important)

This starter **is** the deliverable, and it grows by **extracting validated
patterns from `apps/web` into `@repo/*` packages — not by pre-creating empty
abstraction packages.**

- If a package has **no real consumer yet, don't create it.** Build the feature
  in the reference app first; extract it once the shape has proven out.
- Own the *structure / conventions / glue*; adopt vetted libraries for
  auth / ORM / payments / crypto — never hand-roll those.
- Prefer the smallest change that earns its keep. A new package is a commitment.

## Submitting a pull request

1. **Branch** off `main` (don't commit to `main` directly).
2. Make focused commits with clear messages.
3. **Run the full gate locally and make sure it's green:**

   ```sh
   pnpm lint && pnpm check-types && pnpm build && pnpm test && pnpm test:e2e && pnpm audit
   ```

4. Update docs (`README.md`, package READMEs, `CLAUDE.md`) when behavior or
   structure changes — keep them **truthful** (don't document unbuilt things).
5. Open the PR using the template; describe the change, link any issue, and note
   how you tested it. CI must pass before merge.

Small, well-scoped PRs are reviewed fastest. If you're planning something large,
open an issue first so we can align on approach.
