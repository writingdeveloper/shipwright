/**
 * @repo/pwa — installable + offline + web-push glue for the App Router.
 *
 * Import from the subpaths, which keep server-only (`./push/server`), client
 * (`./register`, `./install`, `./push/client`) and shared (`./manifest`,
 * `./config`) code on the correct side of the bundle:
 *
 *   import { ServiceWorkerProvider } from "@repo/pwa/register";
 *   import { useInstallPrompt, InstallButton } from "@repo/pwa/install";
 *   import { subscribeToPush } from "@repo/pwa/push/client";
 *   import { sendPushToUser } from "@repo/pwa/push/server";
 *   import { defineManifest } from "@repo/pwa/manifest";
 *   import { isPushConfigured } from "@repo/pwa/config";
 */
export {};
