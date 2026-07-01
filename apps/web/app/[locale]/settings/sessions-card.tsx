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

/** Compact "Chrome on Windows"-ish label from a UA string, without a parser dep. */
function describeAgent(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const browser = /Firefox\//.test(userAgent)
    ? "Firefox"
    : /Edg\//.test(userAgent)
      ? "Edge"
      : /Chrome\//.test(userAgent)
        ? "Chrome"
        : /Safari\//.test(userAgent)
          ? "Safari"
          : "Browser";
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
            : "unknown OS";
  return `${browser} on ${os}`;
}

/**
 * Active sessions, with a "sign out other sessions" escape hatch (server-
 * rendered; the revoke posts to a Server Action). Per-session revocation is
 * intentionally not offered — "everything except here" covers the real
 * use-case (a forgotten library computer) without exposing session tokens.
 */
export function SessionsCard({
  sessions,
}: {
  sessions: readonly SessionItem[];
}) {
  const others = sessions.filter((s) => !s.current).length;

  return (
    <Card data-testid="sessions-card">
      <CardHeader>
        <CardTitle asChild>
          <h2>Sessions</h2>
        </CardTitle>
        <CardDescription>Where your account is signed in.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <ul className="flex flex-col gap-2" data-testid="sessions-list">
          {sessions.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 text-sm"
            >
              <span className="text-foreground">
                {describeAgent(s.userAgent)}
                {s.current ? (
                  <span className="text-muted-foreground"> — this device</span>
                ) : null}
              </span>
              <span className="text-muted-foreground">
                since {new Date(s.createdAt).toLocaleDateString("en-US")}
              </span>
            </li>
          ))}
        </ul>
        <form action={revokeOtherSessions}>
          <Button type="submit" variant="outline" disabled={others === 0}>
            Sign out other sessions{others > 0 ? ` (${others})` : ""}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
