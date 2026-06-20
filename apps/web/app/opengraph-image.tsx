import { ogImage, OG_SIZE } from "@repo/seo/og";

import { SITE_DESCRIPTION, SITE_NAME } from "../lib/site";

/**
 * Default OpenGraph card for the whole site — resolves the `/opengraph-image`
 * default that `createMetadata` points at, so shared links get a real preview.
 * Per-route `opengraph-image` files can override this.
 */
export const alt = SITE_DESCRIPTION;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function OpengraphImage() {
  return ogImage({ title: SITE_NAME, subtitle: SITE_DESCRIPTION });
}
