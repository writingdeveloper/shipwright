import { getTranslations } from "next-intl/server";
import { isPushConfigured } from "@repo/pwa/config";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@repo/ui/components/ui/card";

import { PushToggle } from "./push-toggle";

/** Web-push notifications card. Self-hides the toggle when push isn't configured. */
export async function PushCard() {
  const t = await getTranslations("dashboard.notifications");
  return (
    <Card data-testid="push-card">
      <CardHeader>
        <CardTitle asChild>
          <h2>{t("heading")}</h2>
        </CardTitle>
        <CardDescription>
          {isPushConfigured()
            ? t("descriptionEnabled")
            : t("descriptionDisabled")}
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
            {t("configNote")}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
