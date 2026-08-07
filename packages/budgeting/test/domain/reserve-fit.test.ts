/**
 * reserve-fit.test.ts — how big a reserve the history actually asked for.
 *
 * A category's reserve is fed by its underspent months (`left` accrues at month
 * close) and drawn by its overspent ones. If the LIMIT is right, quiet months
 * fund loud ones by themselves and the reserve only has to bridge the timing.
 * So "needed" is not the average overage and not the worst month — it is the
 * deepest cumulative trough of `left − overage`: the starting buffer that would
 * have kept `overspent` at zero across the whole range.
 */
import { describe, test, expect } from "bun:test";
import { reserveFit } from "../../src/domain/reserve-fit";

const m = (month: string, limit: number, spent: number) => ({
  month,
  limitCents: BigInt(limit),
  spentCents: BigInt(spent),
});

describe("reserveFit", () => {
  test("a category that never overspends needs nothing", () => {
    const fit = reserveFit([
      m("2026-01", 20000, 18000),
      m("2026-02", 20000, 15000),
      m("2026-03", 20000, 20000),
    ]);
    expect(fit.neededCents).toBe(0n);
    expect(fit.overageMonths).toBe(0);
    expect(fit.worstMonth).toBeNull();
  });

  test("an overage with nothing saved before it needs the whole overage", () => {
    const fit = reserveFit([m("2026-01", 20000, 35000)]);
    expect(fit.neededCents).toBe(15000n);
    expect(fit.worstMonth).toBe("2026-01");
    expect(fit.worstOverageCents).toBe(15000n);
  });

  test("earlier underspend pays for a later overage", () => {
    // 3 quiet months bank 9000, then a 15000 overage → only 6000 had to be held.
    const fit = reserveFit([
      m("2026-01", 20000, 17000),
      m("2026-02", 20000, 17000),
      m("2026-03", 20000, 17000),
      m("2026-04", 20000, 35000),
    ]);
    expect(fit.neededCents).toBe(6000n);
    expect(fit.worstOverageCents).toBe(15000n);
  });

  test("the DEEPEST trough wins, not the last one", () => {
    const fit = reserveFit([
      m("2026-01", 10000, 30000), // −20000 → trough 20000
      m("2026-02", 10000, 0), // +10000 → −10000
      m("2026-03", 10000, 15000), // −5000 → −15000
    ]);
    expect(fit.neededCents).toBe(20000n);
    expect(fit.worstMonth).toBe("2026-01");
  });

  test("a trough that arrives late still counts", () => {
    const fit = reserveFit([
      m("2026-01", 10000, 12000), // −2000
      m("2026-02", 10000, 10000), // 0
      m("2026-03", 10000, 40000), // −30000 → trough 32000
    ]);
    expect(fit.neededCents).toBe(32000n);
    expect(fit.worstMonth).toBe("2026-03");
    expect(fit.overageMonths).toBe(2);
  });

  test("surplus banked AFTER the trough does not shrink it", () => {
    // The money has to be there when the hole opens; later saving is too late.
    const fit = reserveFit([
      m("2026-01", 10000, 25000), // −15000
      m("2026-02", 10000, 0), // +10000
      m("2026-03", 10000, 0), // +10000
    ]);
    expect(fit.neededCents).toBe(15000n);
  });

  test("the parachute month: one spike sizes the whole reserve", () => {
    // Why the exclusion list exists — until the member says it was a one-off,
    // the history genuinely demands this much (Sport, ~200/mo, one 5000 jump).
    const months = [
      m("2026-01", 20000, 17000),
      m("2026-02", 20000, 18000),
      m("2026-03", 20000, 500000),
      m("2026-04", 20000, 16000),
    ];
    expect(reserveFit(months).neededCents).toBe(475000n);
    // Drop the jump (the member unticked it) and the same history asks for 0.
    const withoutJump = [...months];
    withoutJump[2] = m("2026-03", 20000, 19000);
    expect(reserveFit(withoutJump).neededCents).toBe(0n);
  });

  test("no limit at all means every zloty spent is overage", () => {
    const fit = reserveFit([m("2026-01", 0, 5000)]);
    expect(fit.neededCents).toBe(5000n);
  });

  test("an empty range asks for nothing and says so", () => {
    const fit = reserveFit([]);
    expect(fit.neededCents).toBe(0n);
    expect(fit.monthsCounted).toBe(0);
  });

  test("months are folded in date order however they arrive", () => {
    const shuffled = [
      m("2026-03", 10000, 15000),
      m("2026-01", 10000, 30000),
      m("2026-02", 10000, 0),
    ];
    expect(reserveFit(shuffled).neededCents).toBe(20000n);
    expect(reserveFit(shuffled).worstMonth).toBe("2026-01");
  });
});
