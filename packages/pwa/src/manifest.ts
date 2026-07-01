import type { MetadataRoute } from "next";

/**
 * @repo/pwa — Web App Manifest builder for Next 16's `app/manifest.ts`
 * (`MetadataRoute.Manifest`). Pure: no env, no runtime deps, just the typed
 * object Next serves at `/manifest.webmanifest`. The app supplies its identity
 * (name/colors) and ships the referenced icons under `public/icons/`.
 */

/** Overridable fields for {@link defineManifest}. */
export type ManifestOverrides = {
  readonly name?: string;
  readonly shortName?: string;
  readonly description?: string;
  /** Browser UI / theme color (status bar etc.). */
  readonly themeColor?: string;
  /** Splash background color. */
  readonly backgroundColor?: string;
  /** Launch URL when opened from the home screen. */
  readonly startUrl?: string;
  /**
   * Stable identity for the installed app (lets the browser treat it as the
   * SAME app across `start_url` changes). Defaults to `startUrl`.
   */
  readonly id?: string;
  /** Preferred orientation. Defaults to `"any"` (follow the device). */
  readonly orientation?: MetadataRoute.Manifest["orientation"];
  /** App-store-style categories (e.g. `["productivity"]`). */
  readonly categories?: string[];
  /**
   * Install-UI screenshots. NO default — a manifest that references
   * non-existent screenshot files is worse than none, so apps opt in by
   * shipping the images and passing them here (richer install prompts on
   * mobile Chrome). See the web app manifest `screenshots` spec.
   */
  readonly screenshots?: MetadataRoute.Manifest["screenshots"];
  /** Override the icon set (defaults to the PNG trio under `public/icons/`). */
  readonly icons?: MetadataRoute.Manifest["icons"];
};

/**
 * Build a standalone, installable manifest. Defaults are Shipwright's; pass
 * overrides for the consuming app. Icons reference `public/icons/*` which the app
 * ships (see the icon-generation task).
 */
export function defineManifest(
  overrides: ManifestOverrides = {},
): MetadataRoute.Manifest {
  const name = overrides.name ?? "Shipwright";
  const startUrl = overrides.startUrl ?? "/";
  return {
    name,
    short_name: overrides.shortName ?? name,
    description: overrides.description,
    start_url: startUrl,
    // Explicit stable id so an installed instance survives a start_url change.
    id: overrides.id ?? startUrl,
    display: "standalone",
    // Explicit rather than relying on the browser default; "any" keeps a
    // responsive app free to rotate.
    orientation: overrides.orientation ?? "any",
    background_color: overrides.backgroundColor ?? "#ffffff",
    theme_color: overrides.themeColor ?? "#0a0a0a",
    categories: overrides.categories ?? ["productivity"],
    ...(overrides.screenshots ? { screenshots: overrides.screenshots } : {}),
    icons: overrides.icons ?? [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
