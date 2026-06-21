import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@repo/auth/server";
import { db, desc, eq, task } from "@repo/db";
import { isBillingConfigured, isPro } from "@repo/payments";
import { isPushConfigured } from "@repo/pwa/config";
import { isStorageConfigured } from "@repo/storage";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";

import { SignOutButton } from "../../components/sign-out-button";
import { AddTaskForm } from "./add-task-form";
import { DeleteFileButton } from "./delete-file-button";
import { DeleteTaskButton } from "./delete-task-button";
import { listFiles } from "./file-actions";
import { FileUpload } from "./file-upload";
import { PushToggle } from "./push-toggle";
import { TaskCheckbox } from "./task-checkbox";
import { TrpcTaskList } from "./trpc-task-list";
import { UpgradeButton } from "./upgrade-button";

/** Human-readable byte size for the file list (e.g. "2.5 MB", "812 B"). */
function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb < 10 ? kb.toFixed(1) : Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb < 10 ? mb.toFixed(1) : Math.round(mb)} MB`;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ checkout?: string }>;
}) {
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

  // File storage (owner-scoped). listFiles returns [] when storage isn't
  // configured, so the page renders deterministically with no bucket — the
  // keyless e2e then sees a stable "Storage not configured" card.
  const storageConfigured = isStorageConfigured();
  const files = await listFiles();

  // Surface the Stripe Checkout outcome — `startCheckout` redirects back to
  // /dashboard?checkout=success|cancelled|error, which was previously silent.
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
                {session.user.email}
              </span>
            </p>
          </div>
          <SignOutButton />
        </header>

        <Card data-testid="billing-card">
          <CardHeader>
            <CardTitle asChild>
              <h2>Billing</h2>
            </CardTitle>
            <CardDescription>
              {pro
                ? "You're on the Pro plan. Thanks for your support!"
                : "Upgrade to Pro to support development."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {checkout === "success" ? (
              <p role="status" className="text-foreground mb-3 text-sm">
                Payment received — your Pro access activates momentarily.
              </p>
            ) : checkout === "cancelled" ? (
              <p role="status" className="text-muted-foreground mb-3 text-sm">
                Checkout cancelled — no charge was made.
              </p>
            ) : checkout === "error" ? (
              <p role="alert" className="text-destructive mb-3 text-sm">
                We couldn&apos;t start checkout. Please try again.
              </p>
            ) : null}
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
            <CardTitle asChild>
              <h2>Notifications</h2>
            </CardTitle>
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

        <Card data-testid="files-card">
          <CardHeader>
            <CardTitle asChild>
              <h2 id="files-heading" tabIndex={-1}>
                Files
              </h2>
            </CardTitle>
            {/* Live region: announces the new count after an upload / delete
                (the RSC card re-renders on revalidation). */}
            <CardDescription role="status" aria-live="polite">
              {!storageConfigured
                ? "Storage not configured."
                : files.length === 0
                  ? "No files yet."
                  : `${files.length} file${files.length === 1 ? "" : "s"}`}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!storageConfigured ? (
              <p
                data-testid="storage-not-configured"
                className="text-muted-foreground text-sm"
              >
                Set S3_ENDPOINT, S3_REGION, S3_ACCESS_KEY_ID,
                S3_SECRET_ACCESS_KEY and S3_BUCKET to enable file uploads.
              </p>
            ) : (
              <div className="flex flex-col gap-4">
                <FileUpload />
                {files.length === 0 ? (
                  <div className="border-border text-muted-foreground flex flex-col items-center gap-1 rounded-lg border border-dashed px-6 py-10 text-center text-sm">
                    <p className="text-foreground font-medium">No files yet</p>
                    <p>Upload your first file using the button above.</p>
                  </div>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {files.map((f) => (
                      <li
                        key={f.id}
                        className="hover:bg-accent/50 flex items-center gap-3 rounded-md px-2 py-2 transition-colors"
                      >
                        <a
                          href={f.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={f.name}
                          className="flex-1 truncate text-sm underline-offset-4 hover:underline"
                        >
                          {f.name}
                        </a>
                        <span className="text-muted-foreground text-xs tabular-nums">
                          {formatBytes(f.size)}
                        </span>
                        <DeleteFileButton id={f.id} name={f.name} />
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </CardContent>
        </Card>

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

        <Card>
          <CardHeader>
            <CardTitle asChild>
              <h2 id="tasks-heading" tabIndex={-1}>
                Your tasks
              </h2>
            </CardTitle>
            {/* Live region: announces the new count to screen readers after a
                task is added / toggled / deleted (the RSC list re-renders). */}
            <CardDescription role="status" aria-live="polite">
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
                    <label
                      htmlFor={`task-${t.id}`}
                      className={
                        t.completed
                          ? "text-muted-foreground flex-1 cursor-pointer text-sm line-through"
                          : "flex-1 cursor-pointer text-sm"
                      }
                    >
                      {t.title}
                    </label>
                    <DeleteTaskButton id={t.id} title={t.title} />
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
