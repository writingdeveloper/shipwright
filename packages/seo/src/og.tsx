import { ImageResponse } from "next/og";

/**
 * @repo/seo/og — a default OpenGraph card via `next/og`'s `ImageResponse`.
 *
 * Server-only (pulls `next/og`). Renders a branded title + subtitle card on a
 * solid background — no external image assets, no fonts to ship — so a consuming
 * app gets a real social-share preview from one call in `app/opengraph-image.tsx`.
 * Standard OG size is 1200×630.
 */
export type OgImageOptions = {
  readonly title: string;
  readonly subtitle?: string;
  readonly background?: string;
  readonly foreground?: string;
};

/** Standard OpenGraph card dimensions. */
export const OG_SIZE = { width: 1200, height: 630 } as const;

export function ogImage(options: OgImageOptions): ImageResponse {
  const {
    title,
    subtitle,
    background = "#0a0a0a",
    foreground = "#fafafa",
  } = options;
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px",
          background,
          color: foreground,
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 72, fontWeight: 700, lineHeight: 1.1 }}>
          {title}
        </div>
        {subtitle ? (
          <div style={{ fontSize: 34, marginTop: 28, opacity: 0.7 }}>
            {subtitle}
          </div>
        ) : null}
      </div>
    ),
    { ...OG_SIZE },
  );
}
