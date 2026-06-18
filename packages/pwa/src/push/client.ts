import { isPushConfigured, vapidPublicKey } from "../config";

/**
 * @repo/pwa — browser push subscription helpers. Safe to call from client
 * components; every function guards on feature support and returns null/`"unsupported"`
 * instead of throwing, so callers stay simple. The returned `PushSubscriptionJSON`
 * is persisted by a Server Action (see `./server`).
 */

/** Convert a base64url VAPID key to the Uint8Array `applicationServerKey` expects. */
function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  // Allocate over an explicit ArrayBuffer so the type is Uint8Array<ArrayBuffer>
  // (not ArrayBufferLike), which `applicationServerKey: BufferSource` requires.
  const output = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) output[i] = raw.charCodeAt(i);
  return output;
}

/** Current Notification permission, or "unsupported" when the API is absent. */
export function getPushPermissionState(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

/** True when the browser supports SW + Push and a public VAPID key is configured. */
export function isPushSupported(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "serviceWorker" in navigator &&
    typeof window !== "undefined" &&
    "PushManager" in window &&
    isPushConfigured()
  );
}

/**
 * Subscribe this browser to push. Requests notification permission, subscribes
 * via the ready service worker using the public VAPID key, and returns the
 * subscription JSON (to hand to a Server Action). Returns null if unsupported,
 * unconfigured, or permission is denied.
 */
export async function subscribeToPush(): Promise<PushSubscriptionJSON | null> {
  if (!isPushSupported()) return null;
  const key = vapidPublicKey();
  if (!key) return null;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return null;

  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(key),
  });
  return subscription.toJSON();
}

/**
 * Unsubscribe this browser. Returns the removed endpoint (to hand to a Server
 * Action for deletion), or null if there was no active subscription.
 */
export async function unsubscribeFromPush(): Promise<string | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return null;
  const { endpoint } = subscription;
  await subscription.unsubscribe();
  return endpoint;
}

/** The current subscription's endpoint, or null if not subscribed. */
export async function getCurrentSubscriptionEndpoint(): Promise<string | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) {
    return null;
  }
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return subscription?.endpoint ?? null;
}
