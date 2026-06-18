import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@repo/auth/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";

import { SignOutButton } from "../../components/sign-out-button";

export default async function DashboardPage() {
  // Verify auth in server code (not just middleware) per the repo's rules.
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  return (
    <main className="bg-background flex min-h-svh items-center justify-center p-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>Dashboard</CardTitle>
          <CardDescription>
            You are signed in. Tasks land here in a later phase.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          <div className="flex flex-col gap-1">
            <span className="text-muted-foreground text-sm">Signed in as</span>
            <span className="font-medium">{session.user.email}</span>
          </div>
          <SignOutButton />
        </CardContent>
      </Card>
    </main>
  );
}
