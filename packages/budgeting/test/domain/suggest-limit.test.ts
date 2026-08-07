/**
 * suggest-limit.test.ts — the limit that keeps a category solvent (260807 r2).
 *
 * The first cut asked "what limit reaches the buffer by the next lump", and the
 * next lump is often a 129 zł internet bill next month — so Travel, which owes
 * 4,500 for camping in two months and 15,000 for Japan in twelve, was told to
 * raise its limit to 9,936 and find it all at once.
 *
 * The household's correction: spread it over the whole runway, and stay solvent
 * the WHOLE way rather than hitting one deadline. So the question is a cash-flow
 * one — start from the reserve actually held, accrue what the limit leaves over
 * each month, pay each commitment when it lands, never go below zero.
 */
import { describe, test, expect } from "bun:test";
import { smallestSufficientLimit } from "../../src/domain/suggest-limit";

const zl = (n: number) => BigInt(Math.round(n * 100));

/**
 * Travel, from the live Family Budget: ordinary spending of ~1,389 a month once
 * the scheduled payments come out of the mean, a 3,233 limit, and a year that
 * owes camping twice and a trip to Japan.
 */
const travel = {
  heldCents: 0n,
  baselineSpendCents: zl(1389),
  commitmentsByMonth: [
    zl(1), // Sep — internet
    zl(4500), // Oct — camping
    0n,
    0n,
    0n,
    0n,
    0n,
    0n,
    zl(5129), // May — camping + internet
    zl(129),
    zl(129),
    zl(15000), // Aug — Japan
  ],
  historicalNeedCents: 0n,
  currentLimitCents: zl(3233),
};

describe("smallestSufficientLimit — spread over the whole runway", () => {
  test("does not demand the whole year's commitments in one month", () => {
    // The bug, stated as a test: 9,936 was the old answer, and it came from
    // treating the nearest 129 zł bill as the deadline for everything behind it.
    const s = smallestSufficientLimit(travel)!;
    expect(s.limitCents).toBeLessThan(zl(9936));
  });

  test("stays solvent every month, not just at the end", () => {
    const s = smallestSufficientLimit(travel)!;
    let balance = travel.heldCents;
    for (const c of travel.commitmentsByMonth) {
      balance += s.limitCents - travel.baselineSpendCents - c;
      expect(balance >= 0n).toBe(true);
    }
  });

  test("one groszy lower and some month goes under", () => {
    // Smallest, not merely sufficient.
    const s = smallestSufficientLimit(travel)!;
    let balance = travel.heldCents;
    let wentUnder = false;
    for (const c of travel.commitmentsByMonth) {
      balance += s.limitCents - 1n - travel.baselineSpendCents - c;
      if (balance < 0n) wentUnder = true;
    }
    expect(wentUnder).toBe(true);
  });

  test("the tightest month decides it, not the biggest bill", () => {
    // Camping is 4,500 with two months of runway; Japan is 15,000 with twelve.
    // Per month of runway camping is the harder one — a rule that looked only
    // at the largest charge would miss it.
    const s = smallestSufficientLimit(travel)!;
    expect(s.limitCents - travel.baselineSpendCents).toBe(zl(4501) / 2n);
  });

  test("a reserve already held buys the limit down", () => {
    const withReserve = smallestSufficientLimit({
      ...travel,
      heldCents: zl(4500),
    })!;
    expect(withReserve.limitCents).toBeLessThan(
      smallestSufficientLimit(travel)!.limitCents,
    );
  });

  test("reports the runway it spreads across", () => {
    expect(smallestSufficientLimit(travel)!.overMonths).toBe(12);
  });
});

describe("smallestSufficientLimit — what history still contributes", () => {
  test("the buffer history asks for has to be there by the end too", () => {
    // Commitments are what we know is coming; the historical trough is what
    // irregular ORDINARY spending has cost before. Both have to be funded.
    const plain = smallestSufficientLimit(travel)!;
    const withHistory = smallestSufficientLimit({
      ...travel,
      historicalNeedCents: zl(6000),
    })!;
    expect(withHistory.limitCents).toBeGreaterThan(plain.limitCents);
  });

  test("with nothing ahead at all, the limit is simply what it spends", () => {
    const s = smallestSufficientLimit({
      heldCents: 0n,
      baselineSpendCents: zl(500),
      commitmentsByMonth: [0n, 0n, 0n],
      historicalNeedCents: 0n,
      currentLimitCents: zl(200),
    })!;
    expect(s.limitCents).toBe(zl(500));
    expect(s.direction).toBe("raise");
  });
});

describe("smallestSufficientLimit — the floor and the mirror", () => {
  const fat = {
    heldCents: zl(1811),
    baselineSpendCents: zl(69),
    commitmentsByMonth: [0n, 0n, 0n, 0n],
    historicalNeedCents: 0n,
    currentLimitCents: zl(234),
  };

  test("never suggests a limit below what the category actually spends", () => {
    // A limit under ordinary spending is not a plan, it is a standing
    // overspend, and it drains the very buffer it was asked to size.
    const s = smallestSufficientLimit(fat)!;
    expect(s.limitCents).toBe(zl(69));
    expect(s.direction).toBe("lower");
  });

  test("frees the difference when the limit is above what is needed", () => {
    expect(smallestSufficientLimit(fat)!.deltaCents).toBe(zl(69) - zl(234));
  });

  test("says nothing when the move is under a whole unit", () => {
    expect(
      smallestSufficientLimit({
        heldCents: 0n,
        baselineSpendCents: zl(110.3),
        commitmentsByMonth: [0n],
        historicalNeedCents: 0n,
        currentLimitCents: zl(110),
      }),
    ).toBeNull();
  });

  test("says nothing when there is no runway to spread anything over", () => {
    expect(
      smallestSufficientLimit({
        heldCents: 0n,
        baselineSpendCents: zl(500),
        commitmentsByMonth: [],
        historicalNeedCents: 0n,
        currentLimitCents: zl(200),
      }),
    ).toBeNull();
  });

  test("suggests it even when it is plainly unaffordable", () => {
    // The household's call, not ours: print the number and let them judge.
    const s = smallestSufficientLimit({
      heldCents: 0n,
      baselineSpendCents: zl(200),
      commitmentsByMonth: [zl(50000)],
      historicalNeedCents: 0n,
      currentLimitCents: zl(300),
    })!;
    expect(s.limitCents).toBe(zl(50200));
  });
});
