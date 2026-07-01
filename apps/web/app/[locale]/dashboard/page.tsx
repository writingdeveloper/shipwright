import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "@repo/auth/server";
import { Link, redirect } from "../../../i18n/navigation";
import { getSubscription, isActiveSubscription } from "@repo/payments";
import { Button } from "@repo/ui/components/ui/button";
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
  searchParams: Promise<{ checkout?: string; billing?: string }>;
}) {
  // Verify auth in server code (not just middleware) per the repo's rules.
  const [session, locale, t, tNav] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    getLocale(),
    getTranslations("dashboard"),
    getTranslations("nav"),
  ]);

  if (!session) {
    redirect({ href: "/sign-in", locale });
  }
  // `redirect` is typed `never`; the assertion bridges flow analysis across await.
  const authedSession = session!;
  const userId = authedSession.user.id;

  // Load the subscription ONCE: `pro` drives the header badge, and the Stripe
  // customer id decides whether the billing card offers the portal. Pure DB
  // read — works with no Stripe keys (everyone is "free", no customer).
  const subscription = await getSubscription(userId);
  const pro = isActiveSubscription(subscription);
  const hasBillingAccount = Boolean(subscription?.stripeCustomerId);

  // Stripe redirect outcomes (?checkout=success|cancelled|error,
  // ?billing=portal-error) → billing card.
  const { checkout, billing } = await searchParams;

  return (
    <main id="main" className="bg-background flex min-h-svh justify-center p-6">
      <div className="flex w-full max-w-2xl flex-col gap-6 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight">
                {t("title")}
              </h1>
              {pro ? (
                <span
                  data-testid="pro-badge"
                  className="bg-primary text-primary-foreground inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold"
                >
                  {t("proBadge")}
                </span>
              ) : null}
            </div>
            <p className="text-muted-foreground text-sm">
              {t("signedInAs")}{" "}
              <span className="text-foreground font-medium">
                {authedSession.user.email}
              </span>
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/settings">{tNav("settings")}</Link>
            </Button>
            <SignOutButton />
          </div>
        </header>

        <BillingCard
          pro={pro}
          hasBillingAccount={hasBillingAccount}
          checkout={checkout}
          billing={billing}
        />
        <PushCard />
        <FilesCard />
        <TrpcTaskList />

        <Card>
          <CardHeader>
            <CardTitle asChild>
              <h2>{t("addTask.heading")}</h2>
            </CardTitle>
            <CardDescription>{t("addTask.description")}</CardDescription>
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
