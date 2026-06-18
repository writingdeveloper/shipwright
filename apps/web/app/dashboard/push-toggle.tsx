"use client";

import { useEffect, useState, useTransition } from "react";
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
 * resolves — we surface that as a hint rather than hanging.
 */
export function PushToggle() {
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
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
      const sub = await subscribeToPush();
      if (!sub?.endpoint) return;
      await savePushSubscription(
        sub as { endpoint: string; keys?: { p256dh?: string; auth?: string } },
      );
      setEndpoint(sub.endpoint);
    });

  const onUnsubscribe = () =>
    startTransition(async () => {
      const removed = await unsubscribeFromPush();
      if (removed) await removePushSubscription(removed);
      setEndpoint(null);
    });

  const onTest = () => startTransition(() => sendTestPush());

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="push-controls">
      {subscribed ? (
        <>
          <Button onClick={onUnsubscribe} disabled={pending} variant="outline">
            Disable notifications
          </Button>
          <Button onClick={onTest} disabled={pending} variant="secondary">
            Send test notification
          </Button>
        </>
      ) : (
        <Button onClick={onSubscribe} disabled={pending || !ready}>
          Enable notifications
        </Button>
      )}
    </div>
  );
}
