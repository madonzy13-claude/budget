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
import type { PushSubscriptionRow, NotificationKind } from "@budget/platform";

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
      excludeUserId?: string,
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
    title: (l) =>
      TITLES.RESERVE_TOPUP[(l as LocaleKey) ?? "en"] ?? TITLES.RESERVE_TOPUP.en,
    body: (l) =>
      BODIES.RESERVE_TOPUP[(l as LocaleKey) ?? "en"] ?? BODIES.RESERVE_TOPUP.en,
    tab: "reserves",
  },
  CONFIRM_DRAFT: {
    title: (l) =>
      TITLES.CONFIRM_DRAFT[(l as LocaleKey) ?? "en"] ?? TITLES.CONFIRM_DRAFT.en,
    body: (l) =>
      BODIES.CONFIRM_DRAFT[(l as LocaleKey) ?? "en"] ?? BODIES.CONFIRM_DRAFT.en,
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

// Generic "a task closed elsewhere" message (r31d). No kind-specific copy and no
// financials (D-15) — its only job is to nudge the phone so the SW re-syncs the
// app-icon badge after a task is resolved on another device.
const RESOLVED_TITLE: Record<LocaleKey, string> = {
  en: "Tasks updated",
  pl: "Zadania zaktualizowane",
  uk: "Завдання оновлено",
};
const RESOLVED_BODY: Record<LocaleKey, string> = {
  en: "A task was completed",
  pl: "Zadanie zostało zakończone",
  uk: "Завдання виконано",
};

// ---------------------------------------------------------------------------
// System caller ID used for RLS context in getSubscriptionsForBudget
// ---------------------------------------------------------------------------
const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";

/**
 * Fetch the budget's enabled subscriptions for `kind` and send each one a push
 * whose {title, body, url} is built per-subscription-locale. Stale (410/404)
 * endpoints are deleted. Shared by the created + resolved handlers.
 */
async function dispatchToBudget(
  deps: PushHandlerDeps,
  input: {
    tenantId: string;
    budgetId: string;
    kind: NotificationKind;
    excludeUserId?: string;
  },
  build: (locale: string) => { title: string; body: string; url: string },
): Promise<void> {
  let subs: PushSubscriptionRow[];
  try {
    subs = await deps.pushRepo.getSubscriptionsForBudget(
      input.tenantId,
      input.budgetId,
      input.kind,
      SYSTEM_USER_ID,
      input.excludeUserId,
    );
  } catch (e) {
    console.error("[push-handler] failed to fetch subscriptions", e);
    return;
  }

  console.info(
    `[push-handler] dispatch budget=${input.budgetId} kind=${input.kind} subs=${subs.length}`,
  );
  let sent = 0;
  for (const sub of subs) {
    const { title, body, url } = build(sub.locale ?? "en");
    try {
      await sendPushNotification(
        {
          endpoint: sub.endpoint,
          keys: { p256dh: sub.p256dh, auth: sub.auth },
        },
        JSON.stringify({ title, body, url }),
      );
      sent += 1;
    } catch (e: unknown) {
      const err = e as { statusCode?: number };
      if (err.statusCode === 410 || err.statusCode === 404) {
        try {
          await deps.pushRepo.deleteSubscription(
            sub.endpoint,
            sub.tenantId,
            sub.userId,
          );
        } catch (deleteErr) {
          console.error(
            "[push-handler] failed to delete stale subscription",
            deleteErr,
          );
        }
      } else {
        console.error("[push-handler] sendNotification failed", e);
      }
    }
  }
  console.info(
    `[push-handler] sent=${sent}/${subs.length} budget=${input.budgetId} kind=${input.kind}`,
  );
}

// ---------------------------------------------------------------------------
// Handler registration
// ---------------------------------------------------------------------------

export function registerPushNotificationHandler(deps: PushHandlerDeps): void {
  // A NEW task → the per-kind actionable notification, deep-linking to the task.
  eventBus.subscribe("task.created", async (evt) => {
    const { kind, budgetId, taskId } = evt.payload as {
      kind: string;
      budgetId: string;
      taskId: string;
    };
    // D-11: unknown kind → safe skip, no throw
    const notifType = NOTIFICATION_TYPES[kind];
    if (!notifType) return;

    await dispatchToBudget(
      deps,
      { tenantId: evt.tenantId, budgetId, kind: kind as NotificationKind },
      (locale) => ({
        title: notifType.title(locale),
        body: notifType.body(locale),
        // 260618: the deep-link MUST carry the locale prefix — every app route is
        // `/<locale>/budgets/...`; a locale-less path is rewritten to the budget
        // list by next-intl. Per-sub locale.
        url: `/${locale}/budgets/${budgetId}/${notifType.tab}?task=${taskId}`,
      }),
    );
  });

  // A task COMPLETED (r32) → a "task completed" nudge (also re-syncs the closed
  // phone's app-icon badge). Gated by the dedicated TASK_COMPLETED toggle — NOT
  // the per-kind created toggles — and EXCLUDES the member who closed it (they
  // already know). No ?task= (the task is gone; link to its tab). Auto-resolve
  // (no actorUserId) notifies everyone.
  eventBus.subscribe("task.resolved", async (evt) => {
    const { kind, budgetId, actorUserId } = evt.payload as {
      kind: string;
      budgetId: string;
      taskId: string;
      actorUserId?: string;
    };
    const notifType = NOTIFICATION_TYPES[kind];
    if (!notifType) return; // e.g. INVESTMENT_INSTRUMENT_DELISTED — not user-facing

    await dispatchToBudget(
      deps,
      {
        tenantId: evt.tenantId,
        budgetId,
        kind: "TASK_COMPLETED",
        excludeUserId: actorUserId,
      },
      (locale) => {
        const l = (locale as LocaleKey) ?? "en";
        return {
          title: RESOLVED_TITLE[l] ?? RESOLVED_TITLE.en,
          body: RESOLVED_BODY[l] ?? RESOLVED_BODY.en,
          url: `/${locale}/budgets/${budgetId}/${notifType.tab}`,
        };
      },
    );
  });
}
