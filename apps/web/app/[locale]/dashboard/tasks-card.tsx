import { getTranslations } from "next-intl/server";
import { db, desc, ownedBy, task } from "@repo/db";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";

import { DeleteTaskButton } from "./delete-task-button";
import { TaskCheckbox } from "./task-checkbox";

/**
 * Your-tasks card (RSC). Owner-scoped read (the read-side mirror of the per-user
 * ownership the Server Actions enforce on writes), newest first.
 */
export async function TasksCard({ userId }: { userId: string }) {
  const t = await getTranslations("dashboard.tasks");
  const tasks = await db
    .select()
    .from(task)
    .where(ownedBy(task, userId))
    .orderBy(desc(task.createdAt));

  const completedCount = tasks.filter((t) => t.completed).length;

  return (
    <Card>
      <CardHeader>
        <CardTitle asChild>
          <h2 id="tasks-heading" tabIndex={-1}>
            {t("heading")}
          </h2>
        </CardTitle>
        {/* Live region: announces the new count to screen readers after a task
            is added / toggled / deleted (the RSC list re-renders). */}
        <CardDescription role="status" aria-live="polite">
          {tasks.length === 0
            ? t("statusEmpty")
            : t("statusCount", { completed: completedCount, total: tasks.length })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <div className="border-border text-muted-foreground flex flex-col items-center gap-1 rounded-lg border border-dashed px-6 py-10 text-center text-sm">
            <p className="text-foreground font-medium">{t("emptyHeading")}</p>
            <p>{t("emptyMessage")}</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-1">
            {tasks.map((t) => (
              <li
                key={t.id}
                className="hover:bg-accent/50 flex items-center gap-3 rounded-md px-2 py-2 transition-colors"
              >
                <TaskCheckbox id={t.id} title={t.title} completed={t.completed} />
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
  );
}
