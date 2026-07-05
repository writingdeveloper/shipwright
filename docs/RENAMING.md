# Renaming your app (downstream rebrand)

Rebranding a clone of this starter is a two-layer, one-command-each operation.

## Layer 1 — runtime name: `NEXT_PUBLIC_APP_NAME`

Set one env var in `apps/web/.env`:

```dotenv
NEXT_PUBLIC_APP_NAME=Acme
```

That drives every runtime surface: `<title>`, the homepage H1, the PWA
manifest, OpenGraph/SEO, the legal pages' app/entity name, the admin app's
metadata, and all transactional email subjects/bodies. Unset, everything falls
back to "Shipwright".

## Layer 2 — static identity: `pnpm rename`

Env can't reach identity baked into source (the `?? "Shipwright"` fallbacks,
package/deploy names, the static service worker, and the e2e tests that assert
the fallback). Rewrite exactly those with:

```sh
pnpm rename "Acme"            # or "My Cool App" — quote multi-word names
pnpm rename "Acme" --dry-run  # print every planned edit, write nothing
pnpm rename "Acme" --docs     # ALSO rewrite README/DEPLOY product docs
```

The script derives a dash-case slug (`my-cool-app`) for identifiers and uses
the display name for user-facing strings. It is allowlist-only (each edit is a
precise per-file match — never a global find-replace), idempotent, and hard-
refuses the denylist: `packages/create-shipwright/`, `.changeset/`, `.github/`,
lockfiles, anything mentioning the internal `@repo/*` scope, and intentional
product-identity strings (the Stripe `appInfo` integration id and the legal
template disclaimer, which names the starter the template came from).

After running: review with `git diff`, then `pnpm check-types && pnpm test`
(the e2e fallback assertions are rewritten in lockstep, so both stay green).

The tool's unit tests run with `pnpm test:rename`.
