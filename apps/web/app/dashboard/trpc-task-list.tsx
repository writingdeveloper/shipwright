"use client";

import { useQuery } from "@tanstack/react-query";
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
  const trpc = useTRPC();
  const taskQuery = useQuery(trpc.task.list.queryOptions());

  return (
    <Card data-testid="trpc-task-card">
      <CardHeader>
        <CardTitle>Tasks (via tRPC)</CardTitle>
        <CardDescription>
          Read through the @repo/api tRPC client (opt-in, alongside Server
          Actions).
        </CardDescription>
      </CardHeader>
      <CardContent>
        {taskQuery.isPending ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : taskQuery.isError ? (
          <p className="text-muted-foreground text-sm">Failed to load.</p>
        ) : (
          <p className="text-sm" data-testid="trpc-task-count">
            {taskQuery.data.length} task(s) loaded over tRPC.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
