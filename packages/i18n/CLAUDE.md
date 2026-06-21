# @repo/i18n — Claude Code rules

next-intl routing + locale-aware navigation. The MECHANISM lives here; the STRINGS live in the app (`apps/web/messages/<locale>.json`).

- **Routing** (`src/routing.ts`) is the single source of truth for locales. `localePrefix: "as-needed"` — the default locale (`en`) is unprefixed (`/`, `/sign-in`), others are prefixed (`/ko/...`). Adding a locale = edit `routing.locales` AND add a matching `messages/<locale>.json`; the drift-guard test (`test/messages.test.ts`) fails until both locales' key sets match.
- **Navigation**: import the locale-aware `Link` / `redirect` / `usePathname` / `useRouter` / `getPathname` from the **`@repo/i18n/navigation`** sub-path — NOT `next/link` / `next/navigation`. The plain ones drop the `/ko` prefix on navigation/redirect, silently sending a Korean user to the English URL.
- **`tsconfig` `declaration: false`** is intentional: next-intl's `createNavigation` infers types through `.pnpm` paths that can't be named in a `.d.ts` (TS2742). The app consumes `src` directly via `transpilePackages`, so no declarations are emitted.
- **Build scripts**: next-intl pulls `@swc/core` + `@parcel/watcher` (native build scripts). pnpm 11.3 reads build allow/deny from `pnpm-workspace.yaml` `allowBuilds` (NOT the package.json `pnpm` field, which it ignores) — both are set `false` (unused at runtime; like esbuild/sharp).
- **proxy composition**: the locale middleware (`createMiddleware(routing)`) is composed with the nonce CSP + rate-limit in `apps/web/proxy.ts`. Its matcher MUST exclude `.*\..*` so file routes (e.g. `/sw.js`) aren't locale-rewritten (which broke service-worker registration once).
- **Messages are app-owned content** (`apps/web/messages/`); this package owns only the routing/navigation/request mechanism. The drift-guard test reaches into the app's messages dir — keep that path in sync if the app moves.
