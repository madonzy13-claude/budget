/**
 * VAPID configuration for web push notifications.
 *
 * T-08-01-02: VAPID_PRIVATE_KEY is read only from server-side env.
 * Only NEXT_PUBLIC_VAPID_PUBLIC_KEY is safe for client bundles.
 * This module must NEVER be imported by apps/web.
 */
import webPush from "web-push";

let _initialised = false;

/**
 * Initialise VAPID details once. Called lazily on first use.
 * Reads from env: VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY.
 */
function ensureInitialised(): void {
  if (_initialised) return;
  const subject = process.env.VAPID_SUBJECT;
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!subject || !publicKey || !privateKey) {
    throw new Error(
      "VAPID_SUBJECT, VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY must be set in env (server-only).",
    );
  }
  webPush.setVapidDetails(subject, publicKey, privateKey);
  _initialised = true;
}

/**
 * Send a push notification to a subscription endpoint.
 * Initialises VAPID details on first call.
 */
export function sendPushNotification(
  subscription: webPush.PushSubscription,
  payload: string | Buffer,
  options?: webPush.RequestOptions,
): ReturnType<typeof webPush.sendNotification> {
  ensureInitialised();
  return webPush.sendNotification(subscription, payload, options);
}

export { webPush };
