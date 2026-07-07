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

// r36: iOS shows the notification title as "<title> from <app>" and we can't
// suppress the " from <app>" — so lean in. Every push shares one short nudge
// title; the actual message moves to the body.
const GREETING: Record<LocaleKey, string> = {
  en: "🔔 Your attention needed",
  pl: "🔔 Potrzebna Twoja uwaga",
  uk: "🔔 Потрібна ваша увага",
};
const greeting = (l: string): string =>
  GREETING[(l as LocaleKey) ?? "en"] ?? GREETING.en;

const BODIES: Record<string, Record<LocaleKey, string>> = {
  RESERVE_TOPUP: {
    en: "One of your reserves is running low — tap to top it up.",
    pl: "Jedna z Twoich rezerw się kończy — dotknij, aby ją uzupełnić.",
    uk: "Один із ваших резервів закінчується — торкніться, щоб поповнити.",
  },
  CONFIRM_DRAFT: {
    en: "A recurring expense is waiting — confirm or skip it.",
    pl: "Cykliczny wydatek czeka — potwierdź lub pomiń.",
    uk: "Регулярна витрата очікує — підтвердіть або пропустіть.",
  },
  CUSHION_BELOW_TARGET: {
    en: "Your safety cushion slipped below its goal — tap to top it up.",
    pl: "Twoja poduszka spadła poniżej celu — dotknij, aby ją uzupełnić.",
    uk: "Ваша подушка впала нижче цілі — торкніться, щоб поповнити.",
  },
  INCOME_UNDER_PLANNED: {
    en: "You've planned to spend more than you have — tap to review.",
    pl: "Zaplanowano więcej, niż masz — dotknij, aby przejrzeć.",
    uk: "Ви запланували витратити більше, ніж маєте — торкніться, щоб переглянути.",
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
    title: greeting,
    body: (l) =>
      BODIES.RESERVE_TOPUP[(l as LocaleKey) ?? "en"] ?? BODIES.RESERVE_TOPUP.en,
    tab: "reserves",
  },
  CONFIRM_DRAFT: {
    title: greeting,
    body: (l) =>
      BODIES.CONFIRM_DRAFT[(l as LocaleKey) ?? "en"] ?? BODIES.CONFIRM_DRAFT.en,
    tab: "spendings",
  },
  CUSHION_BELOW_TARGET: {
    title: greeting,
    body: (l) =>
      BODIES.CUSHION_BELOW_TARGET[(l as LocaleKey) ?? "en"] ??
      BODIES.CUSHION_BELOW_TARGET.en,
    tab: "wallets",
  },
  INCOME_UNDER_PLANNED: {
    title: greeting,
    body: (l) =>
      BODIES.INCOME_UNDER_PLANNED[(l as LocaleKey) ?? "en"] ??
      BODIES.INCOME_UNDER_PLANNED.en,
    tab: "spendings",
  },
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

  // r36: the "a task was completed" push (task.resolved → TASK_COMPLETED) was
  // removed at the user's request — task resolutions no longer send a notification.
}
