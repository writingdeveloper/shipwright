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
  return {
    name,
    short_name: overrides.shortName ?? name,
    description: overrides.description,
    start_url: overrides.startUrl ?? "/",
    display: "standalone",
    background_color: overrides.backgroundColor ?? "#ffffff",
    theme_color: overrides.themeColor ?? "#0a0a0a",
    icons: [
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
