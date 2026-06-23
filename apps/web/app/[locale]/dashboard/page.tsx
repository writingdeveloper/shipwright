import { headers } from "next/headers";
import { getLocale } from "next-intl/server";
import { auth } from "@repo/auth/server";
import { redirect } from "../../../i18n/navigation";
import { isPro } from "@repo/payments";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";

import { SignOutButton } from "../../../components/sign-out-button";
import { AddTaskForm } from "./add-task-form";
import { BillingCard } from "./billing-card";
import { FilesCard } from "./files-card";
import { PushCard } from "./push-card";
import { TasksCard } from "./tasks-card";
import { TrpcTaskList } from "./trpc-task-list";

/**
 * Dashboard shell: verifies auth, then composes per-card RSCs that each fetch
 * their own owner-scoped data (BillingCard/FilesCard/TasksCard). This keeps the
 * page small and makes "which package does each card need" obvious — a card you
 * don't want is one import + one line to remove.
 */
export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
  // Verify auth in server code (not just middleware) per the repo's rules.
  const [session, locale] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    getLocale(),
  ]);

  if (!session) {
    redirect({ href: "/sign-in", locale });
  }
  // `redirect` is typed `never`; the assertion bridges flow analysis across await.
  const authedSession = session!;
  const userId = authedSession.user.id;

  // Read once for the header Pro badge; passed to BillingCard to avoid a second
  // isPro query. Pure DB read — works with no Stripe keys (everyone is "free").
  const pro = await isPro(userId);

  // Stripe Checkout outcome (?checkout=success|cancelled|error) → billing card.
  const { checkout } = await searchParams;

  return (
    <main id="main" className="bg-background flex min-h-svh justify-center p-6">
      <div className="flex w-full max-w-2xl flex-col gap-6 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
              {pro ? (
                <span
                  data-testid="pro-badge"
                  className="bg-primary text-primary-foreground inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
                >
                  Pro
                </span>
              ) : null}
            </div>
            <p className="text-muted-foreground text-sm">
              Signed in as{" "}
              <span className="text-foreground font-medium">
                {authedSession.user.email}
              </span>
            </p>
          </div>
          <SignOutButton />
        </header>

        <BillingCard pro={pro} checkout={checkout} />
        <PushCard />
        <FilesCard />
        <TrpcTaskList />

        <Card>
          <CardHeader>
            <CardTitle asChild>
              <h2>Add a task</h2>
            </CardTitle>
            <CardDescription>
              Capture something you need to get done.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AddTaskForm />
          </CardContent>
        </Card>

        <TasksCard userId={userId} />
      </div>
    </main>
  );
}
