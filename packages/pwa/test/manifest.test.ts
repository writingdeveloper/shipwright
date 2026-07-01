import { describe, expect, it } from "vitest";

import { defineManifest } from "../src/manifest";

describe("defineManifest", () => {
  it("applies defaults and is a standalone installable manifest", () => {
    const m = defineManifest();
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    // Explicit identity/orientation/categories (not left to browser defaults).
    expect(m.id).toBe("/");
    expect(m.orientation).toBe("any");
    expect(m.categories).toEqual(["productivity"]);
    // No fabricated screenshot references by default (broken refs are worse).
    expect(m.screenshots).toBeUndefined();
    // 192, 512 and a maskable 512 icon are present.
    expect(m.icons?.map((i) => i.src)).toEqual([
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/icon-maskable-512.png",
    ]);
    expect(m.icons?.some((i) => i.purpose === "maskable")).toBe(true);
  });

  it("derives id from startUrl and passes screenshots through when given", () => {
    const shots = [
      { src: "/screenshots/home.png", sizes: "1080x1920", type: "image/png" },
    ];
    const m = defineManifest({ startUrl: "/app", screenshots: shots });
    expect(m.id).toBe("/app");
    expect(m.screenshots).toEqual(shots);
    // An explicit id/orientation override wins.
    expect(defineManifest({ id: "acme", orientation: "portrait" })).toMatchObject(
      { id: "acme", orientation: "portrait" },
    );
  });

  it("applies name/short_name/theme overrides", () => {
    const m = defineManifest({
      name: "Acme",
      shortName: "Acme",
      themeColor: "#123456",
    });
    expect(m.name).toBe("Acme");
    expect(m.short_name).toBe("Acme");
    expect(m.theme_color).toBe("#123456");
  });

  it("uses an icons override when provided (keeps defaults otherwise)", () => {
    const svg = [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml" }];
    const m = defineManifest({ icons: svg });
    expect(m.icons).toEqual(svg);
    // default is unchanged when no override is passed
    expect(defineManifest().icons?.[0]?.src).toBe("/icons/icon-192.png");
  });
});
