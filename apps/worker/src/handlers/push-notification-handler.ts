/**
 * push-notification-handler.ts — web-push dispatch on task.created (PWAX-05)
 *
 * Subscribes to the eventBus "task.created" event emitted by the outbox
 * dispatcher (08-02). For each enabled push subscription for the affected
 * budget/kind, sends a generic (no-financials) web-push notification with a
 * deep-link url pointing to /budgets/<id>/<tab>?task=<taskId>.
 *
 * D-11: NOTIFICATION_TYPES is an extensible registry — add a key to support
 *       a new trigger; no DB migration needed.
 * D-15: title/body strings carry NO financial amounts (lock-screen safe).
 * T-08-05-03: 410/404 responses delete the stale subscription record.
 */
import { eventBus, sendPushNotification } from "@budget/platform";
import type {
  PushSubscriptionRow,
  NotificationKind,
} from "@budget/platform";

// ---------------------------------------------------------------------------
// Deps interface
// ---------------------------------------------------------------------------

export interface PushHandlerDeps {
  pushRepo: {
    getSubscriptionsForBudget: (
      tenantId: string,
      budgetId: string,
      kind: NotificationKind,
      callerUserId: string,
    ) => Promise<PushSubscriptionRow[]>;
    deleteSubscription: (
      endpoint: string,
      tenantId: string,
      userId: string,
    ) => Promise<void>;
  };
}

// ---------------------------------------------------------------------------
// Notification types registry (D-11 extensible)
// Generic strings only — D-15 lock-screen safety (no amounts, no categories)
// ---------------------------------------------------------------------------

type LocaleKey = "en" | "pl" | "uk";

const TITLES: Record<string, Record<LocaleKey, string>> = {
  RESERVE_TOPUP: {
    en: "Reserve needs attention",
    pl: "Rezerwa wymaga uwagi",
    uk: "Резерв потребує уваги",
  },
  CONFIRM_DRAFT: {
    en: "A draft needs confirming",
    pl: "Projekt wymaga potwierdzenia",
    uk: "Чернетка потребує підтвердження",
  },
  CUSHION_BELOW_TARGET: {
    en: "Cushion below target",
    pl: "Poduszka poniżej celu",
    uk: "Подушка нижче цілі",
  },
};

const BODIES: Record<string, Record<LocaleKey, string>> = {
  RESERVE_TOPUP: {
    en: "Go to Reserves tab",
    pl: "Przejdź do zakładki Rezerwy",
    uk: "Перейдіть до вкладки Резерви",
  },
  CONFIRM_DRAFT: {
    en: "Go to Spendings tab",
    pl: "Przejdź do zakładki Wydatki",
    uk: "Перейдіть до вкладки Витрати",
  },
  CUSHION_BELOW_TARGET: {
    en: "Go to Wallets tab",
    pl: "Przejdź do zakładki Portfele",
    uk: "Перейдіть до вкладки Гаманці",
  },
};

export const NOTIFICATION_TYPES: Record<
  string,
  {
    title: (locale: string) => string;
    body: (locale: string) => string;
    tab: string;
  }
> = {
  RESERVE_TOPUP: {
    title: (l) => TITLES.RESERVE_TOPUP[(l as LocaleKey) ?? "en"] ?? TITLES.RESERVE_TOPUP.en,
    body: (l) => BODIES.RESERVE_TOPUP[(l as LocaleKey) ?? "en"] ?? BODIES.RESERVE_TOPUP.en,
    tab: "reserves",
  },
  CONFIRM_DRAFT: {
    title: (l) => TITLES.CONFIRM_DRAFT[(l as LocaleKey) ?? "en"] ?? TITLES.CONFIRM_DRAFT.en,
    body: (l) => BODIES.CONFIRM_DRAFT[(l as LocaleKey) ?? "en"] ?? BODIES.CONFIRM_DRAFT.en,
    tab: "spendings",
  },
  CUSHION_BELOW_TARGET: {
    title: (l) =>
      TITLES.CUSHION_BELOW_TARGET[(l as LocaleKey) ?? "en"] ??
      TITLES.CUSHION_BELOW_TARGET.en,
    body: (l) =>
      BODIES.CUSHION_BELOW_TARGET[(l as LocaleKey) ?? "en"] ??
      BODIES.CUSHION_BELOW_TARGET.en,
    tab: "wallets",
  },
};

// ---------------------------------------------------------------------------
// System caller ID used for RLS context in getSubscriptionsForBudget
// ---------------------------------------------------------------------------
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

// ---------------------------------------------------------------------------
// Handler registration
// ---------------------------------------------------------------------------

export function registerPushNotificationHandler(deps: PushHandlerDeps): void {
  eventBus.subscribe("task.created", async (evt) => {
    const { kind, budgetId, taskId } = evt.payload as {
      kind: string;
      budgetId: string;
      taskId: string;
    };

    // D-11: unknown kind → safe skip, no throw
    const notifType = NOTIFICATION_TYPES[kind];
    if (!notifType) return;

    let subs: PushSubscriptionRow[];
    try {
      subs = await deps.pushRepo.getSubscriptionsForBudget(
        evt.tenantId,
        budgetId,
        kind as NotificationKind,
        SYSTEM_USER_ID,
      );
    } catch (e) {
      console.error("[push-handler] failed to fetch subscriptions", e);
      return;
    }

    const url = `/budgets/${budgetId}/${notifType.tab}?task=${taskId}`;

    for (const sub of subs) {
      const title = notifType.title(sub.locale ?? "en");
      const body = notifType.body(sub.locale ?? "en");

      try {
        await sendPushNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title, body, url }),
        );
      } catch (e: unknown) {
        const err = e as { statusCode?: number };
        if (err.statusCode === 410 || err.statusCode === 404) {
          // T-08-05-03: stale subscription — delete so dead endpoints don't accumulate
          try {
            await deps.pushRepo.deleteSubscription(
              sub.endpoint,
              sub.tenantId,
              sub.userId,
            );
          } catch (deleteErr) {
            console.error("[push-handler] failed to delete stale subscription", deleteErr);
          }
        } else {
          // Other errors: log + continue (don't block remaining subs)
          console.error("[push-handler] sendNotification failed", e);
        }
      }
    }
  });
}
