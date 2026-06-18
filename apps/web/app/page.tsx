import Link from "next/link";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";

export default function Home() {
  return (
    <main className="bg-background flex min-h-svh flex-col items-center justify-center gap-6 p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Shipwright</CardTitle>
          <CardDescription>
            A per-user Tasks app. Create an account or sign in to reach your
            dashboard.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Auth and the database foundation are wired up with Better Auth and
            Drizzle (libSQL). The protected{" "}
            <code className="font-mono text-xs">/dashboard</code> proves
            server-side auth gating.
          </p>
        </CardContent>
        <CardFooter className="gap-2">
          <Button asChild>
            <Link href="/sign-in">Sign in</Link>
          </Button>
          <Button variant="secondary" asChild>
            <Link href="/sign-up">Sign up</Link>
          </Button>
        </CardFooter>
      </Card>

      <footer className="text-muted-foreground flex items-center gap-4 text-sm">
        <Link href="/privacy" className="hover:text-foreground hover:underline">
          Privacy
        </Link>
        <span aria-hidden="true">·</span>
        <Link href="/terms" className="hover:text-foreground hover:underline">
          Terms
        </Link>
      </footer>
    </main>
  );
}
