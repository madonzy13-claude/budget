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
import { canVibrate, hapticForDay, __resetHaptics } from "@/lib/haptics";

const setVibrate = (impl: unknown) => {
  Object.defineProperty(navigator, "vibrate", {
    value: impl,
    configurable: true,
    writable: true,
  });
};

let calls: (number | number[])[];

beforeEach(() => {
  __resetHaptics();
  document.body.innerHTML = "";
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

/**
 * iOS has no Vibration API at all. The one haptic Apple exposes to the web is
 * the system tick Safari plays when a `<input type="checkbox" switch>` is
 * toggled, so where vibrate() is missing we fall back to clicking a hidden
 * switch (user, 260921: "if it's possible on iOS, I'd like to try").
 *
 * It is a trick, not an API: it gives ONE fixed feel, so income and a payment
 * cannot be told apart there, and Apple may stop honouring it. Everything here
 * is therefore about it being inert and cheap — never about the buzz itself,
 * which no test on this machine can observe.
 */
describe("the iOS fallback", () => {
  const noVibrate = () => {
    // @ts-expect-error — exactly the shape of every iPhone
    delete navigator.vibrate;
  };
  const sw = () =>
    document.querySelector<HTMLInputElement>("input[type=checkbox][switch]");

  test("clicks a switch when there is no vibration API", () => {
    noVibrate();
    let clicked = 0;
    document.addEventListener("click", () => clicked++, true);
    hapticForDay({ hasIncome: true, hasBill: false });
    expect(sw()).not.toBeNull();
    expect(clicked).toBeGreaterThan(0);
  });

  test("reuses the same switch rather than littering the DOM", () => {
    noVibrate();
    hapticForDay({ hasIncome: true, hasBill: false });
    hapticForDay({ hasIncome: false, hasBill: true });
    hapticForDay({ hasIncome: true, hasBill: true });
    expect(
      document.querySelectorAll("input[type=checkbox][switch]"),
    ).toHaveLength(1);
  });

  test("the switch is inert — it cannot be reached or seen", () => {
    noVibrate();
    hapticForDay({ hasIncome: true, hasBill: false });
    const el = sw()!;
    // It exists only to be clicked by us: out of the tab order, hidden from
    // assistive tech, and out of the way of a finger.
    expect(el.tabIndex).toBe(-1);
    expect(el.getAttribute("aria-hidden")).toBe("true");
    expect(el.style.pointerEvents).toBe("none");
  });

  test("an ordinary day still creates nothing at all", () => {
    noVibrate();
    hapticForDay({ hasIncome: false, hasBill: false });
    expect(sw()).toBeNull();
  });

  test("vibrate(), where it exists, wins — no switch is ever made", () => {
    hapticForDay({ hasIncome: true, hasBill: false });
    expect(calls).toHaveLength(1);
    expect(sw()).toBeNull();
  });
});
