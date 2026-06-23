import { Link } from "../../i18n/navigation";
import type { Metadata } from "next";
import { Button } from "@repo/ui/components/ui/button";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <main
      id="main"
      className="bg-background flex min-h-svh flex-col items-center justify-center gap-4 p-6 text-center"
    >
      <h1 className="text-3xl font-semibold tracking-tight">404</h1>
      <p className="text-muted-foreground max-w-sm text-sm">
        We couldn&apos;t find that page.
      </p>
      <Button asChild>
        <Link href="/">Back home</Link>
      </Button>
    </main>
  );
}
