/**
 * budget-reminder.test.ts — reminder cron logic (r32 + configurable time).
 * Pure firing rules (local weekday/hour/minute, day selection, tz, per-sub
 * hour+minute, default 20:00) + the dispatch loop (due-only sends, deep-link to
 * Spendings, stale 410 cleanup).
 */
import { describe, test, expect, mock } from "bun:test";
import {
  localWeekdayHour,
  reminderFiresNow,
  runBudgetReminder,
  type BudgetReminderDeps,
} from "../src/handlers/budget-reminder";

// 2026-07-06 is a Monday. 20:00Z (the new default reminder time).
const MON_20Z = new Date("2026-07-06T20:00:00Z");

describe("localWeekdayHour", () => {
  test("UTC: Monday 20:00", () => {
    expect(localWeekdayHour(MON_20Z, "UTC")).toEqual({
      iso: 1,
      hour: 20,
      minute: 0,
    });
  });
  test("converts to the target zone (NY is UTC-4 in July)", () => {
    // 22:00Z → 18:00 EDT, still Monday
    expect(
      localWeekdayHour(new Date("2026-07-06T22:00:00Z"), "America/New_York"),
    ).toEqual({ iso: 1, hour: 18, minute: 0 });
  });
  test("resolves the local MINUTE in a half-hour-offset zone (Kolkata +5:30)", () => {
    // 14:30Z = 20:00 IST, Monday
    expect(
      localWeekdayHour(new Date("2026-07-06T14:30:00Z"), "Asia/Kolkata"),
    ).toEqual({ iso: 1, hour: 20, minute: 0 });
  });
  test("invalid zone → null", () => {
    expect(localWeekdayHour(MON_20Z, "Not/AZone")).toBeNull();
  });
});

describe("reminderFiresNow", () => {
  test("fires at the default 20:00 on a selected day", () => {
    expect(reminderFiresNow({ days: [1], tz: "UTC" }, MON_20Z)).toBe(true);
  });
  test("does NOT fire at the wrong hour", () => {
    expect(
      reminderFiresNow(
        { days: [1], tz: "UTC" },
        new Date("2026-07-06T18:00:00Z"),
      ),
    ).toBe(false);
  });
  test("honors a per-sub hour + minute (09:30, not 20:00)", () => {
    const sub = { days: [1], tz: "UTC", hour: 9, minute: 30 };
    expect(reminderFiresNow(sub, new Date("2026-07-06T09:30:00Z"))).toBe(true);
    // wrong minute → no fire
    expect(reminderFiresNow(sub, new Date("2026-07-06T09:00:00Z"))).toBe(false);
    // the default 20:00 must NOT fire when a custom time is set
    expect(reminderFiresNow(sub, MON_20Z)).toBe(false);
  });
  test("does NOT fire when today's weekday is not selected", () => {
    expect(reminderFiresNow({ days: [2, 3], tz: "UTC" }, MON_20Z)).toBe(false);
  });
  test("fires in the user's tz even when UTC hour differs", () => {
    // 00:00Z next day = 20:00 New York (Mon), day 1 selected
    expect(
      reminderFiresNow(
        { days: [1], tz: "America/New_York" },
        new Date("2026-07-07T00:00:00Z"),
      ),
    ).toBe(true);
  });
});

function makeSub(
  over: Partial<{
    userId: string;
    days: number[];
    configTz: string | null;
    hour: number | null;
    minute: number | null;
  }>,
) {
  return {
    id: "s-" + (over.userId ?? "u"),
    tenantId: "b1",
    userId: over.userId ?? "u1",
    endpoint: "https://push.example/" + (over.userId ?? "u1"),
    p256dh: "p",
    auth: "a",
    locale: "en",
    days: over.days ?? [1],
    configTz: over.configTz ?? null,
    hour: over.hour ?? null,
    minute: over.minute ?? null,
  };
}

describe("runBudgetReminder", () => {
  function deps(over: Partial<BudgetReminderDeps> = {}): BudgetReminderDeps {
    return {
      getAllSubscribedTenantIds: mock(async () => ["b1"]),
      getReminderSubscriptionsForBudget: mock(async () => [
        makeSub({ userId: "due", days: [1] }),
        makeSub({ userId: "notday", days: [2] }),
      ]),
      // Members' identity timezones (used when no config.tz override).
      getUserTimezones: mock(async () => ({ due: "UTC", notday: "UTC" })),
      sendPushNotification: mock(async () => ({})),
      deleteSubscription: mock(async () => {}),
      now: () => MON_20Z,
      ...over,
    };
  }

  test("sends only to due subs at the default 20:00, deep-linked to Spendings", async () => {
    const d = deps();
    const res = await runBudgetReminder(d);
    expect(res.sent).toBe(1);
    expect(d.sendPushNotification).toHaveBeenCalledTimes(1);
    const [, payload] = (d.sendPushNotification as ReturnType<typeof mock>).mock
      .calls[0];
    const body = JSON.parse(payload as string);
    expect(body.url).toBe("/en/budgets/b1/spendings");
    expect(body.title).toBeTruthy();
  });

  test("respects a per-sub custom time (fires at 09:30, not the default)", async () => {
    const d = deps({
      getReminderSubscriptionsForBudget: mock(async () => [
        makeSub({ userId: "early", days: [1], hour: 9, minute: 30 }),
      ]),
      getUserTimezones: mock(async () => ({ early: "UTC" })),
      now: () => new Date("2026-07-06T09:30:00Z"),
    });
    expect((await runBudgetReminder(d)).sent).toBe(1);
  });

  test("uses the member's identity timezone (no config.tz override)", async () => {
    // 00:00Z next day = 20:00 in New York; member's saved tz drives the fire time.
    const d = deps({
      getReminderSubscriptionsForBudget: mock(async () => [
        makeSub({ userId: "ny", days: [1], configTz: null }),
      ]),
      getUserTimezones: mock(async () => ({ ny: "America/New_York" })),
      now: () => new Date("2026-07-07T00:00:00Z"),
    });
    const res = await runBudgetReminder(d);
    expect(res.sent).toBe(1);
  });

  test("config.tz override wins over the identity timezone", async () => {
    // Member's identity tz is NY, but they explicitly saved UTC → fire at 20:00Z.
    const d = deps({
      getReminderSubscriptionsForBudget: mock(async () => [
        makeSub({ userId: "x", days: [1], configTz: "UTC" }),
      ]),
      getUserTimezones: mock(async () => ({ x: "America/New_York" })),
      now: () => MON_20Z,
    });
    expect((await runBudgetReminder(d)).sent).toBe(1);
  });

  test("410 removes the stale subscription", async () => {
    const send = mock(async () => {
      throw { statusCode: 410 };
    });
    const del = mock(async () => {});
    const d = deps({
      getReminderSubscriptionsForBudget: mock(async () => [
        makeSub({ userId: "due", days: [1] }),
      ]),
      getUserTimezones: mock(async () => ({ due: "UTC" })),
      sendPushNotification: send,
      deleteSubscription: del,
    });
    await runBudgetReminder(d);
    expect(del).toHaveBeenCalledTimes(1);
  });
});
