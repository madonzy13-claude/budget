/**
 * budget-reminder.ts — hourly cron (r32). For each budget with push
 * subscriptions, sends an "update your budget" push to every reminder-enabled
 * member whose LOCAL time is the reminder hour (~18:00) on a selected weekday.
 * Deep-links to the Spendings tab. Timezone + weekdays come from the member's
 * BUDGET_REMINDER pref config (written by the settings UI), so the worker needs
 * no cross-schema access to the identity timezone.
 */
// Runtime platform functions are imported dynamically inside registerBudgetReminder
// so this module loads even when a sibling test mocks @budget/platform (bun's
// mock.module is process-global). Only the type import remains static (erased).
import type { ReminderSubscriptionRow } from "@budget/platform";

const SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000001";
export const REMINDER_HOUR = 18; // 6pm local

type LocaleKey = "en" | "pl" | "uk";
const TITLE: Record<LocaleKey, string> = {
  en: "Time to update your budget",
  pl: "Czas zaktualizować budżet",
  uk: "Час оновити бюджет",
};
const BODY: Record<LocaleKey, string> = {
  en: "Log today's spending to stay on track.",
  pl: "Zapisz dzisiejsze wydatki, aby trzymać się planu.",
  uk: "Запишіть сьогоднішні витрати, щоб не збитися з плану.",
};

/**
 * ISO weekday (1=Mon..7=Sun) and 0–23 hour for `now` in IANA zone `tz`.
 * Returns null when the zone is invalid so the caller safely skips.
 */
export function localWeekdayHour(
  now: Date,
  tz: string,
): { iso: number; hour: number } | null {
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
    const hour = Number(parts.find((p) => p.type === "hour")?.value);
    const map: Record<string, number> = {
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
      Sun: 7,
    };
    const iso = map[wd];
    if (!iso || Number.isNaN(hour)) return null;
    return { iso, hour };
  } catch {
    return null;
  }
}

/** Fire iff it is the reminder hour AND today's weekday is selected, in the sub's tz. */
export function reminderFiresNow(
  sub: { days: number[]; tz: string },
  now: Date,
  targetHour: number = REMINDER_HOUR,
): boolean {
  const lw = localWeekdayHour(now, sub.tz);
  if (!lw) return false;
  return lw.hour === targetHour && sub.days.includes(lw.iso);
}

export interface BudgetReminderDeps {
  getAllSubscribedTenantIds: () => Promise<string[]>;
  getReminderSubscriptionsForBudget: (
    tenantId: string,
    budgetId: string,
    callerUserId: string,
  ) => Promise<ReminderSubscriptionRow[]>;
  // r32: each member's geo-seeded IANA timezone (identity.users). Absent → "UTC".
  getUserTimezones: (userIds: string[]) => Promise<Record<string, string>>;
  sendPushNotification: (
    sub: { endpoint: string; keys: { p256dh: string; auth: string } },
    payload: string,
  ) => Promise<unknown>;
  deleteSubscription: (
    endpoint: string,
    tenantId: string,
    userId: string,
  ) => Promise<void>;
  now?: () => Date;
}

/** Core: send reminders due right now. Exported for tests (deps injected). */
export async function runBudgetReminder(
  deps: BudgetReminderDeps,
): Promise<{ sent: number }> {
  const now = deps.now ? deps.now() : new Date();
  let sent = 0;
  const tenantIds = await deps.getAllSubscribedTenantIds();
  for (const budgetId of tenantIds) {
    let subs: ReminderSubscriptionRow[];
    try {
      subs = await deps.getReminderSubscriptionsForBudget(
        budgetId,
        budgetId,
        SYSTEM_USER_ID,
      );
    } catch (e) {
      console.error("[budget-reminder] fetch failed", budgetId, e);
      continue;
    }
    // Resolve each member's timezone (pref override → identity tz → UTC).
    let tzMap: Record<string, string> = {};
    try {
      tzMap = await deps.getUserTimezones([
        ...new Set(subs.map((s) => s.userId)),
      ]);
    } catch (e) {
      console.error("[budget-reminder] tz lookup failed", budgetId, e);
    }
    for (const sub of subs) {
      const tz = sub.configTz ?? tzMap[sub.userId] ?? "UTC";
      if (!reminderFiresNow({ days: sub.days, tz }, now)) continue;
      const loc = (
        (["en", "pl", "uk"] as string[]).includes(sub.locale)
          ? sub.locale
          : "en"
      ) as LocaleKey;
      const url = `/${loc}/budgets/${budgetId}/spendings`;
      try {
        await deps.sendPushNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          JSON.stringify({ title: TITLE[loc], body: BODY[loc], url }),
        );
        sent += 1;
      } catch (e: unknown) {
        const err = e as { statusCode?: number };
        if (err.statusCode === 410 || err.statusCode === 404) {
          try {
            await deps.deleteSubscription(
              sub.endpoint,
              sub.tenantId,
              sub.userId,
            );
          } catch (delErr) {
            console.error("[budget-reminder] stale delete failed", delErr);
          }
        } else {
          console.error("[budget-reminder] send failed", e);
        }
      }
    }
  }
  return { sent };
}

interface BossLike {
  work: (queue: string, handler: () => Promise<void>) => Promise<void>;
}

/** Register the hourly worker; the schedule/queue are created in worker.ts. */
export function registerBudgetReminder(boss: BossLike): void {
  boss.work("budget-reminder", async () => {
    const platform = await import("@budget/platform");
    const { sent } = await runBudgetReminder({
      getAllSubscribedTenantIds: platform.getAllSubscribedTenantIds,
      getReminderSubscriptionsForBudget:
        platform.getReminderSubscriptionsForBudget,
      getUserTimezones: platform.getUserTimezones,
      sendPushNotification:
        platform.sendPushNotification as BudgetReminderDeps["sendPushNotification"],
      deleteSubscription: platform.deleteSubscription,
    });
    if (sent > 0) console.info(`[budget-reminder] sent ${sent} reminder(s)`);
  });
}
