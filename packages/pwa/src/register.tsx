"use client";

import { useEffect, useState, type ReactElement } from "react";

/**
 * @repo/pwa — registers the app's static service worker (`/sw.js`) and prompts
 * the user to reload when a new version takes over.
 *
 * Mount once (e.g. in `app/layout.tsx`) as a self-closing element. It renders
 * nothing until an UPDATE is ready, then a small "reload" banner. Registration
 * runs in PRODUCTION only: a cache-first SW interferes with the dev
 * HMR/Turbopack flow, so dev intentionally skips it (test the PWA against
 * `next build && next start` or the standalone server). Failures are swallowed
 * — a missing/blocked SW must never break the page.
 */
export function ServiceWorkerProvider(): ReactElement | null {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // `sw.js` skipWaiting()s + clients.claim()s, so an updated worker takes
    // control shortly after it installs, firing `controllerchange`. Prompt to
    // reload ONLY when an OLD worker was already in control — the very first
    // install has no prior controller and needs no "new version" banner. The
    // page keeps its already-loaded (old) assets until the user reloads.
    const hadController = Boolean(navigator.serviceWorker.controller);
    const onControllerChange = () => {
      if (hadController) setUpdateReady(true);
    };
    navigator.serviceWorker.addEventListener(
      "controllerchange",
      onControllerChange,
    );

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
    } else {
      window.addEventListener("load", register, { once: true });
    }

    return () => {
      navigator.serviceWorker.removeEventListener(
        "controllerchange",
        onControllerChange,
      );
      window.removeEventListener("load", register);
    };
  }, []);

  if (!updateReady) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="sw-update-banner"
      className="bg-foreground text-background fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md items-center justify-between gap-4 rounded-lg px-4 py-3 text-sm shadow-lg"
    >
      <span>A new version is available.</span>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="bg-background text-foreground rounded-md px-3 py-1 font-medium"
        >
          Reload
        </button>
        <button
          type="button"
          onClick={() => setUpdateReady(false)}
          aria-label="Dismiss"
          className="text-background/70 hover:text-background rounded-md px-2 py-1"
        >
          Dismiss
        </button>
      </div>
    </div>
  );
}

export default ServiceWorkerProvider;
