/**
 * push-subscribe.ts — shared per-budget web-push subscribe helper.
 *
 * Used by BOTH the Settings master switch (push-prefs-section) and the
 * onboarding wizard (step-features push toggle, acted on at budget create).
 * Per-budget model (260618): the subscription row is keyed (endpoint, budgetId)
 * server-side, so the same device endpoint can be enabled independently per
 * budget. See [[project_push_per_budget]].
 */
import { api } from "@/lib/api-client";

export type PushSubscribeResult =
  | "subscribed"
  | "denied"
  | "unsupported"
  | "error";

export function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Request notification permission + subscribe THIS device for `budgetId`.
 * Best-effort + never throws — returns a discriminated result the caller maps
 * to UI (toast / switch state). "unsupported" covers no-Notification / no-SW /
 * missing VAPID key; "denied" is an explicit permission denial.
 */
export async function subscribeToPushForBudget(
  budgetId: string,
): Promise<PushSubscribeResult> {
  try {
    if (
      typeof Notification === "undefined" ||
      typeof navigator === "undefined" ||
      !("serviceWorker" in navigator)
    ) {
      return "unsupported";
    }

    const permission = await Notification.requestPermission();
    if (permission !== "granted") return "denied";

    const vapidKey = process.env["NEXT_PUBLIC_VAPID_PUBLIC_KEY"] ?? "";
    if (!vapidKey) return "unsupported";

    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey)
        .buffer as ArrayBuffer,
    });

    const p256dhKey = subscription.getKey("p256dh");
    const authKey = subscription.getKey("auth");
    const p256dh = p256dhKey
      ? btoa(String.fromCharCode(...new Uint8Array(p256dhKey)))
      : "";
    const auth = authKey
      ? btoa(String.fromCharCode(...new Uint8Array(authKey)))
      : "";

    // X-Budget-ID MUST be set explicitly: the API derives tenantIds solely from
    // this header (intersected with budget_members), and the subscribe route
    // 403s when budgetId ∉ tenantIds. From the onboarding wizard the path is
    // /budgets/new, so the api-client can't infer X-Budget-ID from the URL — the
    // 403 silently dropped the subscription and Settings showed OFF (260618). In
    // Settings the path already carries the id, but passing it here is correct in
    // both contexts (we ARE subscribing for budgetId).
    const res = await api.push.subscribe.$post(
      { json: { endpoint: subscription.endpoint, p256dh, auth, budgetId } },
      { headers: { "X-Budget-ID": budgetId } },
    );
    if (!res.ok) return "error";
    return "subscribed";
  } catch {
    return "error";
  }
}
