"use client";

import { useEffect } from "react";

/**
 * @repo/pwa — registers the app's static service worker (`/sw.js`).
 *
 * Mount once (e.g. in `app/layout.tsx`) as a self-closing element; it renders
 * nothing. Registration runs in PRODUCTION only: a cache-first SW interferes
 * with the dev HMR/Turbopack flow, so dev intentionally skips it (test the PWA
 * against `next build && next start` or the standalone server). Failures are
 * swallowed — a missing/blocked SW must never break the page.
 */
export function ServiceWorkerProvider(): null {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }
    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        // best-effort: ignore registration errors
      });
    };
    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}

export default ServiceWorkerProvider;
