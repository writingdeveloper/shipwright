import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline",
  robots: { index: false, follow: false },
};

/**
 * Offline fallback shown by the service worker when a navigation fails with no
 * cached page. Kept static + dependency-light so it precaches cleanly.
 */
export default function OfflinePage() {
  return (
    <main id="main" className="bg-background flex min-h-svh flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">
        You&apos;re offline
      </h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        This page isn&apos;t available without a connection. Reconnect and try
        again — your previously loaded pages still work.
      </p>
    </main>
  );
}
