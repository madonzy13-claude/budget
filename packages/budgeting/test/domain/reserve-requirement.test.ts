/**
 * reserve-requirement.test.ts — what a reserve must hold TODAY (260807 r3).
 *
 * `needed` used to be worked out as though the household would never save
 * another złoty, so it came out as the sum of the whole runway's lumps. Travel
 * read "short 7,702" while its own limit was quietly putting 1,834 a month into
 * that reserve — and the limit suggestion, which does count accrual, said the
 * limit could come DOWN. Two numbers, two different worlds, in one tooltip.
 */
import { describe, test, expect } from "bun:test";
import { reserveNeededToday } from "../../src/domain/reserve-requirement";
import { smallestSufficientLimit } from "../../src/domain/suggest-limit";

const zl = (n: number) => BigInt(Math.round(n * 100));

/** Travel, from the live Family Budget. */
const travel = {
  baselineSpendCents: zl(1399),
  commitmentsByMonth: [
    zl(1),
    zl(4500),
    0n,
    0n,
    0n,
    0n,
    0n,
    0n,
    zl(5129),
    zl(129),
    zl(129),
    zl(15000),
  ],
  historicalNeedCents: zl(3191),
};

describe("reserveNeededToday", () => {
  test("counts the accrual today's limit already produces", () => {
    // 3,233 against 1,399 of ordinary spending is 1,834 a month. Over twelve
    // months that is 22,008 against 24,888 of commitments plus 3,191 of history
    // — only the difference has to be sitting there now.
    expect(reserveNeededToday({ ...travel, limitCents: zl(3233) })).toBe(
      zl(24888) + zl(3191) - zl(1834) * 12n,
    );
  });

  test("the same payment further out needs less today, not the same", () => {
    // The old model charged a payment's full amount whenever it fell, so a trip
    // three years away raised what you needed TODAY by fifteen thousand. Here
    // the months in front of it fund it.
    const soon = reserveNeededToday({ ...travel, limitCents: zl(3233) });
    const later = reserveNeededToday({
      ...travel,
      commitmentsByMonth: [
        ...travel.commitmentsByMonth.slice(0, 11),
        0n,
        0n,
        0n,
        0n,
        zl(15000),
      ],
      limitCents: zl(3233),
    });
    expect(later).toBeLessThan(soon);
  });

  test("a limit that cannot accrue leaves the whole bill to the reserve", () => {
    // The old model's assumption, now only applied when it is actually true.
    expect(reserveNeededToday({ ...travel, limitCents: zl(1399) })).toBe(
      zl(24888) + zl(3191),
    );
  });

  test("never negative — a generous limit needs no reserve, not a debt", () => {
    expect(reserveNeededToday({ ...travel, limitCents: zl(9000) })).toBe(0n);
  });

  test("the tightest month decides, not the last one", () => {
    const needed = reserveNeededToday({
      baselineSpendCents: 0n,
      commitmentsByMonth: [0n, zl(4500), 0n, 0n],
      historicalNeedCents: 0n,
      limitCents: zl(1000),
    });
    expect(needed).toBe(zl(4500) - zl(1000) * 2n);
  });

  test("with no runway, history's own buffer is the whole requirement", () => {
    expect(
      reserveNeededToday({
        baselineSpendCents: zl(500),
        commitmentsByMonth: [],
        historicalNeedCents: zl(1200),
        limitCents: zl(900),
      }),
    ).toBe(zl(1200));
  });
});

describe("the requirement and the suggestion are one function", () => {
  const held = zl(17315);

  test("at the suggested limit, the requirement is covered by what is held", () => {
    const s = smallestSufficientLimit({
      ...travel,
      heldCents: held,
      currentLimitCents: zl(3233),
    })!;
    expect(
      reserveNeededToday({ ...travel, limitCents: s.limitCents }) <= held,
    ).toBe(true);
  });

  test("one groszy below it, the requirement is no longer covered", () => {
    const s = smallestSufficientLimit({
      ...travel,
      heldCents: held,
      currentLimitCents: zl(3233),
    })!;
    expect(
      reserveNeededToday({ ...travel, limitCents: s.limitCents - 1n }) > held,
    ).toBe(true);
  });

  test("a category already ahead is told it can lower the limit, not top up", () => {
    const needed = reserveNeededToday({ ...travel, limitCents: zl(3233) });
    expect(needed).toBeLessThan(held);
    const s = smallestSufficientLimit({
      ...travel,
      heldCents: held,
      currentLimitCents: zl(3233),
    })!;
    expect(s.direction).toBe("lower");
  });
});

describe("a recurring charge is counted once, not twice", () => {
  // The defect the source split exists to remove (audit, 260807): insurance of
  // 12,000 every January, limit 1,000/month. History carried the January that
  // already happened AND the schedule projects the next one, so the two legs
  // charged the same policy twice and demanded 11,000 for a category that needs
  // nothing. With ordinary spend separated at source, history's buffer is 0.
  test("an all-scheduled category needs nothing once its history is ordinary-only", () => {
    expect(
      reserveNeededToday({
        baselineSpendCents: 0n, // every złoty it spends is the policy
        commitmentsByMonth: [
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          0n,
          zl(12000),
        ],
        historicalNeedCents: 0n, // …so the ordinary trough is flat
        limitCents: zl(1000),
      }),
    ).toBe(0n);
  });
});
