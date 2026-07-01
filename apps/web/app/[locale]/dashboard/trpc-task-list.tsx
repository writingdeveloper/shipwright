"use client";

import { useQuery } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { useTRPC } from "@repo/api/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";

/**
 * Demo of the opt-in tRPC client: reads the signed-in user's tasks through
 * `task.list` with TanStack React Query. The Server-Action task UI + RSC list
 * above are unchanged — this just shows the type-safe client-query pattern.
 */
export function TrpcTaskList() {
  const t = useTranslations("dashboard.trpc");
  const trpc = useTRPC();
  // Refetch on every mount so the card reflects tasks created via Server Actions
  // (which mutate the DB but don't touch this React Query cache) whenever you
  // navigate back to the dashboard — the browser-singleton QueryClient otherwise
  // serves a stale list.
  const taskQuery = useQuery({
    ...trpc.task.list.queryOptions(),
    refetchOnMount: "always",
  });

  return (
    <Card data-testid="trpc-task-card">
      <CardHeader>
        <CardTitle asChild>
          <h2>{t("heading")}</h2>
        </CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent role="status" aria-live="polite">
        {taskQuery.isPending ? (
          <p className="text-muted-foreground text-sm">{t("loading")}</p>
        ) : taskQuery.isError ? (
          <p className="text-destructive text-sm">{t("error")}</p>
        ) : (
          <p className="text-sm" data-testid="trpc-task-count">
            {t("statusCount", { count: taskQuery.data.length })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
