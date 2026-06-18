import type { MetadataRoute } from "next";
import { defineManifest } from "@repo/pwa/manifest";

import { SITE_DESCRIPTION, SITE_NAME } from "../lib/site";

/**
 * Web App Manifest, served by Next at `/manifest.webmanifest`. Built from the
 * shared site identity via `@repo/pwa`. Icons live in `public/icons/`.
 */
export default function manifest(): MetadataRoute.Manifest {
  return defineManifest({
    name: SITE_NAME,
    shortName: SITE_NAME,
    description: SITE_DESCRIPTION,
  });
}
