import { getFormatter, getTranslations } from "next-intl/server";
import { Button } from "@repo/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";

import { revokeOtherSessions } from "./account-actions";

type SessionItem = {
  readonly id: string;
  /** ISO string (serialised by the server component). */
  readonly createdAt: string;
  readonly userAgent: string | null;
  readonly current: boolean;
};

/**
 * Compact "Chrome on Windows"-ish label from a UA string, without a parser dep.
 * Brand names stay literal; only the fallbacks and the composed label are
 * translated (passed in by the caller, which holds the next-intl translator).
 */
function describeAgent(
  userAgent: string | null,
  labels: {
    readonly unknownDevice: string;
    readonly browserFallback: string;
    readonly osUnknown: string;
    readonly deviceLabel: (browser: string, os: string) => string;
  },
): string {
  if (!userAgent) return labels.unknownDevice;
  const browser = /Firefox\//.test(userAgent)
    ? "Firefox"
    : /Edg\//.test(userAgent)
      ? "Edge"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : labels.browserFallback;
  const os = /Windows/.test(userAgent)
    ? "Windows"
    : /Mac OS X/.test(userAgent)
      ? "macOS"
      : /Android/.test(userAgent)
        ? "Android"
        : /iPhone|iPad/.test(userAgent)
          ? "iOS"
          : /Linux/.test(userAgent)
            ? "Linux"
            : labels.osUnknown;
  return labels.deviceLabel(browser, os);
}

/**
 * Active sessions, with a "sign out other sessions" escape hatch (server-
 * rendered; the revoke posts to a Server Action). Per-session revocation is
 * intentionally not offered — "everything except here" covers the real
 * use-case (a forgotten library computer) without exposing session tokens.
 */
export async function SessionsCard({
  sessions,
}: {
  sessions: readonly SessionItem[];
}) {
  const others = sessions.filter((s) => !s.current).length;
  const [t, format] = await Promise.all([
    getTranslations("settings.sessions"),
    getFormatter(),
  ]);
  const labels = {
    unknownDevice: t("unknownDevice"),
    browserFallback: t("browserFallback"),
    osUnknown: t("osUnknown"),
    deviceLabel: (browser: string, os: string) =>
      t("deviceLabel", { browser, os }),
  };

  return (
    <Card data-testid="sessions-card">
      <CardHeader>
        <CardTitle asChild>
          <h2>{t("heading")}</h2>
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-2" data-testid="sessions-list">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span className="text-foreground">
                {describeAgent(s.userAgent, labels)}
                {s.current ? (
                  <span className="text-muted-foreground">
                    {t("currentDevice")}
                  </span>
                ) : null}
              </span>
              <span className="text-muted-foreground">
                {t("since", {
                  date: format.dateTime(new Date(s.createdAt), {
                    dateStyle: "medium",
                  }),
                })}
              </span>
            </li>
          ))}
        </ul>
        <form action={revokeOtherSessions}>
          <Button type="submit" variant="outline" disabled={others === 0}>
            {others > 0 ? t("revokeWithCount", { count: others }) : t("revoke")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
