import { env } from "@repo/env";

/** Social providers shipwright wires (extend here + in server.ts to add more). */
export type SocialProvider = "github" | "google";

/**
 * The providers CONFIGURED for the browser — derived purely from the public
 * clientIds (`NEXT_PUBLIC_*`), so this is client-safe (no secret import). The
 * sign-in UI renders a button per entry; keyless ⇒ `[]` ⇒ no buttons.
 */
export function enabledSocialProviders(): SocialProvider[] {
  const providers: SocialProvider[] = [];
  if (env.NEXT_PUBLIC_GITHUB_CLIENT_ID) providers.push("github");
  if (env.NEXT_PUBLIC_GOOGLE_CLIENT_ID) providers.push("google");
  return providers;
}
