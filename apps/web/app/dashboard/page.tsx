import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { auth } from "@repo/auth/server";
import { db, desc, eq, task } from "@repo/db";
import { isBillingConfigured, isPro } from "@repo/payments";
import { isPushConfigured } from "@repo/pwa/config";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";
import { Input } from "@repo/ui/components/ui/input";

import { SignOutButton } from "../../components/sign-out-button";
import { createTask, deleteTask } from "./actions";
import { PushToggle } from "./push-toggle";
import { TaskCheckbox } from "./task-checkbox";
import { UpgradeButton } from "./upgrade-button";

export default async function DashboardPage() {
  // Verify auth in server code (not just middleware) per the repo's rules.
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session) {
    redirect("/sign-in");
  }

  // Data Access scoped to the owner: only ever load this user's tasks, newest
  // first. The query is the read-side mirror of the per-user ownership the
  // Server Actions enforce on writes.
  const tasks = await db
    .select()
    .from(task)
    .where(eq(task.userId, session.user.id))
    .orderBy(desc(task.createdAt));

  const completedCount = tasks.filter((t) => t.completed).length;

  // Billing state (owner-scoped). `pro` is a pure DB read, so it works with no
  // Stripe keys (everyone is "free"); `billingConfigured` gates whether the
  // upgrade button can ever start a real checkout. With no keys the button is
  // hidden and we render a stable "Billing not configured" note instead — so the
  // keyless e2e sees a deterministic dashboard and is never redirected off-site.
  const pro = await isPro(session.user.id);
  const billingConfigured = isBillingConfigured();

  return (
    <main className="bg-background flex min-h-svh justify-center p-6">
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
                {session.user.email}
              </span>
            </p>
          </div>
          <SignOutButton />
        </header>

        <Card data-testid="billing-card">
          <CardHeader>
            <CardTitle>Billing</CardTitle>
            <CardDescription>
              {pro
                ? "You're on the Pro plan. Thanks for your support!"
                : "Upgrade to Pro to support development."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {pro ? (
              <p
                data-testid="billing-pro-note"
                className="text-muted-foreground text-sm"
              >
                Your Pro subscription is active.
              </p>
            ) : billingConfigured ? (
              <UpgradeButton />
            ) : (
              <p
                data-testid="billing-not-configured"
                className="text-muted-foreground text-sm"
              >
                Billing not configured.
              </p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="push-card">
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>
              {isPushConfigured()
                ? "Enable web push to get notified on this device."
                : "Push not configured."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isPushConfigured() ? (
              <PushToggle />
            ) : (
              <p
                data-testid="push-not-configured"
                className="text-muted-foreground text-sm"
              >
                Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to enable
                web push.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Add a task</CardTitle>
            <CardDescription>
              Capture something you need to get done.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form action={createTask} className="flex items-start gap-2">
              <div className="flex-1">
                <label htmlFor="task-title" className="sr-only">
                  Task title
                </label>
                <Input
                  id="task-title"
                  name="title"
                  placeholder="e.g. Ship the tasks feature"
                  autoComplete="off"
                  maxLength={280}
                  required
                />
              </div>
              <Button type="submit">Add</Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Your tasks</CardTitle>
            <CardDescription>
              {tasks.length === 0
                ? "Nothing here yet."
                : `${completedCount} of ${tasks.length} done`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {tasks.length === 0 ? (
              <div className="border-border text-muted-foreground flex flex-col items-center gap-1 rounded-lg border border-dashed px-6 py-10 text-center text-sm">
                <p className="text-foreground font-medium">No tasks yet</p>
                <p>Add your first task using the form above.</p>
              </div>
            ) : (
              <ul className="flex flex-col gap-1">
                {tasks.map((t) => (
                  <li
                    key={t.id}
                    className="hover:bg-accent/50 flex items-center gap-3 rounded-md px-2 py-2 transition-colors"
                  >
                    <TaskCheckbox
                      id={t.id}
                      title={t.title}
                      completed={t.completed}
                    />
                    <span
                      className={
                        t.completed
                          ? "text-muted-foreground flex-1 text-sm line-through"
                          : "flex-1 text-sm"
                      }
                    >
                      {t.title}
                    </span>
                    <form action={deleteTask}>
                      <input type="hidden" name="id" value={t.id} />
                      <Button
                        type="submit"
                        variant="ghost"
                        size="icon"
                        className="text-muted-foreground hover:text-destructive size-8"
                        aria-label={`Delete "${t.title}"`}
                      >
                        <Trash2Icon className="size-4" />
                      </Button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
