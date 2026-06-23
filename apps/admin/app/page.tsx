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
          <CardTitle>Admin</CardTitle>
          <CardDescription>
            Scaffolded with <code className="font-mono text-xs">pnpm gen app</code>{" "}
            and wired to the shared <code className="font-mono text-xs">@repo/ui</code>{" "}
            design system.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Edit <code className="font-mono text-xs">app/page.tsx</code> to start
            building. This page already renders shared components, so the design
            tokens and Tailwind setup are confirmed working.
          </p>
        </CardContent>
        <CardFooter>
          <Button>Get started</Button>
        </CardFooter>
      </Card>
    </main>
  );
}
