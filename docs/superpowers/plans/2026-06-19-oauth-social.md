# OAuth Social Login (Google + GitHub) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (inline). Steps use checkbox (`- [ ]`).

**Goal:** Add Google + GitHub social login, graceful (keyless → no buttons, existing 38 e2e intact).

**Architecture:** 4 new env vars (2 server secrets, 2 NEXT_PUBLIC clientIds). `@repo/auth` gets a client-safe `config.ts` (`enabledSocialProviders()`, reads only NEXT_PUBLIC) on a `./config` subpath, and registers `socialProviders` in server.ts only when a provider's clientId+secret are set. `apps/web` adds a `SocialSignIn` client component (buttons + "or" divider, renders null when none) into sign-in/sign-up.

**Tech Stack:** Better Auth 1.6.19 (`socialProviders`, `authClient.signIn.social`), Next 16, Playwright + axe.

**API caveat:** `socialProviders` shape + `authClient.signIn.social({ provider, callbackURL })` are pinned to 1.6.19; **Task 3/4 verify via check-types** — adjust if a name differs.

---

### Task 1: env + turbo + .env.example

**Files:**
- Modify: `packages/env/src/index.ts`
- Modify: `turbo.json`
- Modify: `apps/web/.env.example`

- [ ] **Step 1: env schema** — in `packages/env/src/index.ts`:

In the `server:` block (after `VAPID_SUBJECT`), add:
```ts
    // OAuth provider secrets (owned by @repo/auth). OPTIONAL + paired with the
    // public clientId: a provider registers only when BOTH its id and secret are
    // set, so the keyless app/tests/CI run with no social login.
    GITHUB_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),
```

In the `client:` block (after `NEXT_PUBLIC_GA_ID`), add:
```ts
    // OAuth clientIds (NOT secrets — they appear in the redirect URL). OPTIONAL:
    // the social button for a provider shows only when its clientId is set.
    NEXT_PUBLIC_GITHUB_CLIENT_ID: z.string().optional(),
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: z.string().optional(),
```

In `runtimeEnv:` (after `NEXT_PUBLIC_GA_ID`), add:
```ts
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    NEXT_PUBLIC_GITHUB_CLIENT_ID: process.env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
    NEXT_PUBLIC_GOOGLE_CLIENT_ID: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
```

- [ ] **Step 2: turbo globalEnv** — in `turbo.json`, add to the `globalEnv` array (after `NEXT_PUBLIC_GA_ID`):
```json
    "GITHUB_CLIENT_SECRET",
    "GOOGLE_CLIENT_SECRET",
    "NEXT_PUBLIC_GITHUB_CLIENT_ID",
    "NEXT_PUBLIC_GOOGLE_CLIENT_ID",
```

- [ ] **Step 3: .env.example** — append to `apps/web/.env.example`:
```sh
# OAuth social login — Google + GitHub (@repo/auth). ALL optional: a provider's
# button + server registration appear only when BOTH its clientId and secret are
# set, so the app runs keyless with email/password only. The clientId is public
# (it appears in the OAuth redirect); only the secret is sensitive.
# Create credentials: GitHub → Settings/Developer settings/OAuth Apps; Google →
# Cloud Console/Credentials. Callback URL: <BETTER_AUTH_URL>/api/auth/callback/<provider>.
# NEXT_PUBLIC_GITHUB_CLIENT_ID=
# GITHUB_CLIENT_SECRET=
# NEXT_PUBLIC_GOOGLE_CLIENT_ID=
# GOOGLE_CLIENT_SECRET=
```

- [ ] **Step 4: check-types** — `pnpm --filter @repo/env check-types`. Expected: PASS.

- [ ] **Step 5: Commit**
```bash
git add packages/env/src/index.ts turbo.json apps/web/.env.example
git commit -m "feat(env): OAuth clientId/secret vars (Google + GitHub)"
```

---

### Task 2: `@repo/auth/config` — enabledSocialProviders

**Files:**
- Create: `packages/auth/src/config.ts`
- Modify: `packages/auth/package.json` (add `./config` export)

- [ ] **Step 1: Implement** — `packages/auth/src/config.ts`:
```ts
import { env } from "@repo/env";

/** Social providers shipwright wires (extend here + in server.ts to add more). */
export type SocialProvider = "github" | "google";

/**
 * The providers that are CONFIGURED for the browser — derived purely from the
 * public clientIds (`NEXT_PUBLIC_*`), so this is client-safe (no secret import).
 * The sign-in UI renders a button per entry; keyless ⇒ `[]` ⇒ no buttons.
 */
export function enabledSocialProviders(): SocialProvider[] {
  const providers: SocialProvider[] = [];
  if (env.NEXT_PUBLIC_GITHUB_CLIENT_ID) providers.push("github");
  if (env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) providers.push("google");
  return providers;
}
```

- [ ] **Step 2: Export subpath** — in `packages/auth/package.json` `exports`, add (after `./client`):
```json
    "./config": "./src/config.ts",
```

- [ ] **Step 3: check-types** — `pnpm --filter @repo/auth check-types`. Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add packages/auth/src/config.ts packages/auth/package.json
git commit -m "feat(auth): enabledSocialProviders() (client-safe)"
```

---

### Task 3: `@repo/auth/server` — register socialProviders

**Files:**
- Modify: `packages/auth/src/server.ts`

- [ ] **Step 1: Implement** — in `packages/auth/src/server.ts`, add a `socialProviders` key to the `betterAuth({...})` config (sibling of `emailVerification`, before `databaseHooks`). Build it conditionally from env:
```ts
  // Register a provider ONLY when its public clientId + secret are both set, so
  // the keyless app/tests/CI have no social login (graceful). clientId is public;
  // the secret stays server-side.
  socialProviders: {
    ...(env.NEXT_PUBLIC_GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET
      ? {
          github: {
            clientId: env.NEXT_PUBLIC_GITHUB_CLIENT_ID,
            clientSecret: env.GITHUB_CLIENT_SECRET,
          },
        }
      : {}),
    ...(env.NEXT_PUBLIC_GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
      ? {
          google: {
            clientId: env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
            clientSecret: env.GOOGLE_CLIENT_SECRET,
          },
        }
      : {}),
  },
```

- [ ] **Step 2: check-types** — `pnpm --filter @repo/auth check-types`. Expected: PASS (verifies the `socialProviders` option shape). If it errors, the option name/shape differs in this Better Auth — fix here.

- [ ] **Step 3: Commit**
```bash
git add packages/auth/src/server.ts
git commit -m "feat(auth): register Google/GitHub socialProviders when configured"
```

---

### Task 4: `apps/web` — SocialSignIn component

**Files:**
- Create: `apps/web/components/social-sign-in.tsx`

- [ ] **Step 1: Implement**:
```tsx
"use client";

import { useState } from "react";
import { authClient } from "@repo/auth/client";
import { enabledSocialProviders } from "@repo/auth/config";
import { Button } from "@repo/ui/components/ui/button";

const LABELS: Record<"github" | "google", string> = {
  github: "GitHub",
  google: "Google",
};

/**
 * Social-login buttons + an "or" divider, shown only for providers whose public
 * clientId is set (`enabledSocialProviders`). Renders null when none are
 * configured, so the keyless app shows only the email/password form.
 */
export function SocialSignIn() {
  const providers = enabledSocialProviders();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  if (providers.length === 0) return null;

  async function signInWith(provider: "github" | "google") {
    setError(null);
    setPending(true);
    const { error } = await authClient.signIn.social({
      provider,
      callbackURL: "/dashboard",
    });
    // On success the browser is redirected, so we only reach here on error.
    setPending(false);
    if (error) {
      setError(error.message ?? `Couldn't sign in with ${LABELS[provider]}.`);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {providers.map((p) => (
          <Button
            key={p}
            type="button"
            variant="outline"
            className="w-full"
            disabled={pending}
            onClick={() => signInWith(p)}
          >
            Continue with {LABELS[p]}
          </Button>
        ))}
      </div>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      <div
        className="text-muted-foreground flex items-center gap-3 text-xs"
        aria-hidden="true"
      >
        <span className="bg-border h-px flex-1" />
        or
        <span className="bg-border h-px flex-1" />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: check-types** — `pnpm --filter web check-types`. Expected: PASS (verifies `authClient.signIn.social`). If `signIn.social` errors, check the Better Auth client method name and fix.

- [ ] **Step 3: Commit**
```bash
git add apps/web/components/social-sign-in.tsx
git commit -m "feat(web): SocialSignIn buttons (graceful, null when none)"
```

---

### Task 5: wire SocialSignIn into sign-in + sign-up

**Files:**
- Modify: `apps/web/app/sign-in/page.tsx`
- Modify: `apps/web/app/sign-up/page.tsx`

- [ ] **Step 1: sign-in** — import and render at the top of the form's `CardContent`. Add the import (after the existing PasswordInput import):
```tsx
import { SocialSignIn } from "../../components/social-sign-in";
```
Insert `<SocialSignIn />` as the first child of the sign-in form's `<CardContent …>` (before the email field's `<div>`):
```tsx
          <CardContent className="flex flex-col gap-4">
            <SocialSignIn />
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
```

- [ ] **Step 2: sign-up** — same: add the import and `<SocialSignIn />` as the first child of the sign-up form's `<CardContent …>` (before the name field's `<div>`):
```tsx
import { SocialSignIn } from "../../components/social-sign-in";
```
```tsx
          <CardContent className="flex flex-col gap-4">
            <SocialSignIn />
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Name</Label>
```

- [ ] **Step 3: check-types + lint** — `pnpm --filter web check-types && pnpm --filter web lint`. Expected: PASS.

- [ ] **Step 4: Commit**
```bash
git add apps/web/app/sign-in/page.tsx apps/web/app/sign-up/page.tsx
git commit -m "feat(web): show social login on sign-in/sign-up"
```

---

### Task 6: e2e + detailed QA

**Files:**
- Create: `apps/web/e2e/social-auth.spec.ts`

- [ ] **Step 1: e2e** — `apps/web/e2e/social-auth.spec.ts` (keyless: no clientId → no buttons; this pins the graceful contract):
```ts
import { expect, test } from "@playwright/test";

/**
 * Graceful contract: with no NEXT_PUBLIC_*_CLIENT_ID set (the keyless default),
 * the sign-in/up pages show NO social button and only the email/password form —
 * so the existing flows are untouched. (The real OAuth round-trip needs provider
 * credentials + an external redirect; that is a deployment-time check.)
 */
test("sign-in shows no social button when no provider is configured", async ({
  page,
}) => {
  await page.goto("/sign-in");
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Continue with/ }),
  ).toHaveCount(0);
});

test("sign-up shows no social button when no provider is configured", async ({
  page,
}) => {
  await page.goto("/sign-up");
  await expect(page.getByLabel("Name")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Continue with/ }),
  ).toHaveCount(0);
});
```

- [ ] **Step 2: Full gate + e2e** — free port 3100 first.
Run: `pnpm check-types && pnpm lint && pnpm test && pnpm build && pnpm test:e2e`
Expected: all green; existing 38 e2e preserved + 2 new = 40; a11y-axe still clean (no social button keyless → no new violations). The build lists sign-in/sign-up unchanged.

- [ ] **Step 3: Commit**
```bash
git add apps/web/e2e/social-auth.spec.ts
git commit -m "test(auth): e2e — social buttons hidden when unconfigured"
```

---

## Verification (whole feature)

- [ ] Full gate + e2e green (existing 38 preserved + 2 new = 40).
- [ ] check-types confirms Better Auth `socialProviders` + `signIn.social` API names.
- [ ] Keyless: `enabledSocialProviders() === []` (proven by the e2e button-count assertions) → no UI/flow change; axe clean.
- [ ] `apps/web` build unaffected; sign-in/up still render the email/password form.

**Detailed-QA note:** the graceful keyless path (no buttons) is covered by e2e + axe + check-types. The CONFIGURED path (buttons present, real OAuth redirect) requires provider credentials and an external IdP, so it is a documented deployment-time verification, not an automated test.
