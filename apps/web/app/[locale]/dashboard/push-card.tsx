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
export function PushCard() {
  return (
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
            Set NEXT_PUBLIC_VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to enable web
            push.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
