// apps/web/test/lib/haptics.test.ts
/**
 * A touch of feedback when the forecast scrub passes something that actually
 * moves money (user, 260921).
 *
 * The rules that matter are all about NOT being annoying:
 *  - a day with nothing on it is silent;
 *  - a device that cannot vibrate is silent rather than throwing;
 *  - income and a payment feel different, because they are different;
 *  - and a browser that throws from vibrate() (some do, under a policy that
 *    requires a prior user gesture) must not take the scrub down with it.
 */
import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { canVibrate, hapticForDay } from "@/lib/haptics";

const setVibrate = (impl: unknown) => {
  Object.defineProperty(navigator, "vibrate", {
    value: impl,
    configurable: true,
    writable: true,
  });
};

let calls: (number | number[])[];

beforeEach(() => {
  calls = [];
  setVibrate((p: number | number[]) => {
    calls.push(p);
    return true;
  });
});

afterEach(() => {
  // @ts-expect-error — removing the stub between tests
  delete navigator.vibrate;
});

describe("hapticForDay", () => {
  test("a day carrying income buzzes", () => {
    hapticForDay({ hasIncome: true, hasBill: false });
    expect(calls).toHaveLength(1);
  });

  test("a day carrying a scheduled payment buzzes", () => {
    hapticForDay({ hasIncome: false, hasBill: true });
    expect(calls).toHaveLength(1);
  });

  test("income and a payment do not feel the same", () => {
    hapticForDay({ hasIncome: true, hasBill: false });
    hapticForDay({ hasIncome: false, hasBill: true });
    expect(calls[0]).not.toEqual(calls[1]);
  });

  test("a day with both feels like the pair, not like either one", () => {
    hapticForDay({ hasIncome: true, hasBill: true });
    hapticForDay({ hasIncome: true, hasBill: false });
    hapticForDay({ hasIncome: false, hasBill: true });
    expect(calls[0]).not.toEqual(calls[1]);
    expect(calls[0]).not.toEqual(calls[2]);
  });

  test("an ordinary day is silent — most of the window is ordinary", () => {
    hapticForDay({ hasIncome: false, hasBill: false });
    expect(calls).toHaveLength(0);
  });

  test("a device with no vibration support is silent, not broken", () => {
    // @ts-expect-error — the API simply is not there (every iPhone, today)
    delete navigator.vibrate;
    expect(() =>
      hapticForDay({ hasIncome: true, hasBill: false }),
    ).not.toThrow();
  });

  test("a vibrate() that throws does not take the scrub down", () => {
    setVibrate(() => {
      throw new Error("blocked by permissions policy");
    });
    expect(() =>
      hapticForDay({ hasIncome: true, hasBill: true }),
    ).not.toThrow();
  });
});

describe("canVibrate", () => {
  test("true when the platform offers it", () => {
    expect(canVibrate()).toBe(true);
  });

  test("false when it does not", () => {
    // @ts-expect-error — removing the API
    delete navigator.vibrate;
    expect(canVibrate()).toBe(false);
  });
});
