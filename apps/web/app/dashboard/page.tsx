import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Trash2Icon } from "lucide-react";
import { auth } from "@repo/auth/server";
import { db, desc, eq, task } from "@repo/db";
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
import { TaskCheckbox } from "./task-checkbox";

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

  return (
    <main className="bg-background flex min-h-svh justify-center p-6">
      <div className="flex w-full max-w-2xl flex-col gap-6 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">Tasks</h1>
            <p className="text-muted-foreground text-sm">
              Signed in as{" "}
              <span className="text-foreground font-medium">
                {session.user.email}
              </span>
            </p>
          </div>
          <SignOutButton />
        </header>

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
