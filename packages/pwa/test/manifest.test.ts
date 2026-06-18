import { describe, expect, it } from "vitest";

import { defineManifest } from "../src/manifest";

describe("defineManifest", () => {
  it("applies defaults and is a standalone installable manifest", () => {
    const m = defineManifest();
    expect(m.display).toBe("standalone");
    expect(m.start_url).toBe("/");
    // 192, 512 and a maskable 512 icon are present.
    expect(m.icons?.map((i) => i.src)).toEqual([
      "/icons/icon-192.png",
      "/icons/icon-512.png",
      "/icons/icon-maskable-512.png",
    ]);
    expect(m.icons?.some((i) => i.purpose === "maskable")).toBe(true);
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
});
