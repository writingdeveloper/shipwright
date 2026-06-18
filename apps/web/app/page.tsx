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
    <main className="bg-background flex min-h-svh items-center justify-center p-6">
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
    </main>
  );
}
