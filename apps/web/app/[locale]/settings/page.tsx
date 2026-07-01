import { headers } from "next/headers";
import { getLocale, getTranslations } from "next-intl/server";
import { auth } from "@repo/auth/server";
import { Button } from "@repo/ui/components/ui/button";

import { Link, redirect } from "../../../i18n/navigation";
import { DangerCard } from "./danger-card";
import { PasswordCard } from "./password-card";
import { ProfileCard } from "./profile-card";
import { SessionsCard } from "./sessions-card";

/**
 * Account settings: profile, password, sessions, and the danger zone. Auth is
 * verified here for the initial render AND inside every Server Action the
 * cards post to (repo rule — the page gate is UX, the action gate is the
 * security boundary).
 */
export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ changed?: string }>;
}) {
  const [session, locale, { changed }, t, tNav] = await Promise.all([
    auth.api.getSession({ headers: await headers() }),
    getLocale(),
    searchParams,
    getTranslations("settings"),
    getTranslations("nav"),
  ]);

  if (!session) {
    redirect({ href: "/sign-in", locale });
  }
  const authed = session!;

  // The user's sessions, for the sessions card. Bound to the request cookie —
  // Better Auth only ever returns THIS user's sessions.
  const sessions = await auth.api.listSessions({ headers: await headers() });

  return (
    <main id="main" className="bg-background flex min-h-svh justify-center p-6">
      <div className="flex w-full max-w-2xl flex-col gap-6 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-col gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">
              {t("title")}
            </h1>
            <p className="text-muted-foreground text-sm">
              {t("manageAccount")}{" "}
              <span className="text-foreground font-medium">
                {authed.user.email}
              </span>
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/dashboard">{tNav("backToDashboard")}</Link>
          </Button>
        </header>

        <ProfileCard initialName={authed.user.name ?? ""} />
        <PasswordCard justChanged={changed === "password"} />
        <SessionsCard
          sessions={sessions.map((s) => ({
            id: s.id,
            createdAt: s.createdAt.toISOString(),
            userAgent: s.userAgent ?? null,
            current: s.token === authed.session.token,
          }))}
        />
        <DangerCard />
      </div>
    </main>
  );
}
