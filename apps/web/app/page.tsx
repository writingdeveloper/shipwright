import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardAction,
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
            shadcn/ui (new-york) wired up as the shared design system in{" "}
            <code className="font-mono text-xs">@repo/ui</code>.
          </CardDescription>
          <CardAction>
            <Button variant="outline" size="sm">
              Docs
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            This Button and Card are imported from the shared{" "}
            <code className="font-mono text-xs">@repo/ui</code> package and
            styled with Tailwind v4 theme tokens.
          </p>
        </CardContent>
        <CardFooter className="gap-2">
          <Button>Get started</Button>
          <Button variant="secondary">Learn more</Button>
        </CardFooter>
      </Card>
    </main>
  );
}
