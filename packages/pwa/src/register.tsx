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
    // This effect runs AFTER hydration, by which point `window`'s `load` event
    // may have already fired — in which case a freshly-added "load" listener
    // never runs and the SW would never register. Register immediately when the
    // document is already complete; otherwise wait for the load event.
    if (document.readyState === "complete") {
      register();
      return;
    }
    window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}

export default ServiceWorkerProvider;
