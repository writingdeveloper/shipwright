"use client";

import { useEffect, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import {
  getCurrentSubscriptionEndpoint,
  subscribeToPush,
  unsubscribeFromPush,
} from "@repo/pwa/push/client";
import { Button } from "@repo/ui/components/ui/button";

import {
  removePushSubscription,
  savePushSubscription,
  sendTestPush,
} from "./push-actions";

/**
 * Client control to subscribe/unsubscribe this browser to web push and send a
 * test notification. Rendered only when push is configured (the server gates it).
 * In dev the service worker isn't registered, so `serviceWorker.ready` never
 * resolves — we surface that as a hint rather than hanging. Every async action is
 * wrapped so a rejected Server Action / denied permission shows an inline error
 * instead of an unhandled rejection + a stuck UI.
 */
export function PushToggle() {
  const t = useTranslations("dashboard.notifications");
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    let active = true;
    // serviceWorker.ready resolves only once a SW is registered (prod). Guard so
    // dev (no SW) doesn't leave the UI stuck "loading".
    const timeout = setTimeout(() => active && setReady(true), 1500);
    getCurrentSubscriptionEndpoint()
      .then((e) => {
        if (!active) return;
        setEndpoint(e);
        setReady(true);
        clearTimeout(timeout);
      })
      .catch(() => active && setReady(true));
    return () => {
      active = false;
      clearTimeout(timeout);
    };
  }, []);

  const subscribed = endpoint !== null;

  const onSubscribe = () =>
    startTransition(async () => {
      setError(null);
      try {
        const sub = await subscribeToPush();
        if (!sub?.endpoint) {
          setError(t("errorEnable"));
          return;
        }
        await savePushSubscription(
          sub as {
            endpoint: string;
            keys?: { p256dh?: string; auth?: string };
          },
        );
        setEndpoint(sub.endpoint);
      } catch {
        setError(t("errorEnableRetry"));
      }
    });

  const onUnsubscribe = () =>
    startTransition(async () => {
      setError(null);
      try {
        const removed = await unsubscribeFromPush();
        if (removed) await removePushSubscription(removed);
        setEndpoint(null);
      } catch {
        setError(t("errorDisable"));
      }
    });

  const onTest = () =>
    startTransition(async () => {
      setError(null);
      try {
        await sendTestPush();
      } catch {
        setError(t("errorTest"));
      }
    });

  return (
    <div className="flex flex-col gap-2" data-testid="push-controls">
      <div className="flex flex-wrap items-center gap-2">
        {subscribed ? (
          <>
            <Button onClick={onUnsubscribe} disabled={pending} variant="outline">
              {t("disable")}
            </Button>
            <Button onClick={onTest} disabled={pending} variant="secondary">
              {t("test")}
            </Button>
          </>
        ) : (
          <Button onClick={onSubscribe} disabled={pending || !ready}>
            {t("enable")}
          </Button>
        )}
      </div>
      {error ? (
        <p className="text-destructive text-sm" data-testid="push-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
