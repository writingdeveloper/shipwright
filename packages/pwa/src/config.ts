import { env } from "@repo/env";

/**
 * @repo/pwa — client-safe push configuration.
 *
 * Reads ONLY the public VAPID key (a `NEXT_PUBLIC_*` var), so this module is safe
 * to import from client components and Server Components alike to gate the push
 * UI. The PRIVATE key is read only server-side in `./push/delivery`. With no
 * public key the whole push feature is a no-op (UI disabled, sender skips).
 */

/** The public VAPID key, or `undefined` when push is not configured. */
export function vapidPublicKey(): string | undefined {
  return env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
}

/**
 * Is push subscribable? True only when a public VAPID key is present. The single
 * gate the client/UI uses to decide whether to offer push at all. (The server
 * sender additionally requires the private key — see `./push/delivery`.)
 */
export function isPushConfigured(): boolean {
  return Boolean(env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);
}
