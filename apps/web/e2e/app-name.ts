/**
 * Single source of the app name the e2e suite BUILDS with and ASSERTS on.
 *
 * `playwright.config.ts` injects this exact value as `NEXT_PUBLIC_APP_NAME`
 * into the test server's build env (process env beats `.env` files in Next),
 * and the branding specs assert this same value — so the suite is green
 * whether the owner left the default, exported the var in their shell/CI, or
 * ran `pnpm rename`. It deliberately does NOT read `apps/web/.env`: like the
 * DB and port, the e2e server is isolated from local development config.
 */
export const E2E_APP_NAME =
  process.env.NEXT_PUBLIC_APP_NAME?.trim() || "Shipwright";

/** Escape the way React escapes TEXT nodes (e.g. inside `<title>`). */
export function escapeHtmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

/** Escape the way React escapes ATTRIBUTE values (e.g. `content="..."`). */
export function escapeHtmlAttr(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
}
