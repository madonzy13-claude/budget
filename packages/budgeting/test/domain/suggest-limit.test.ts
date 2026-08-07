/**
 * suggest-limit.test.ts — the limit that funds a buffer month by month (260807).
 *
 * "Top up 682 now" is the only advice the reserve chart gives today, and for a
 * category whose mean spend already exceeds its limit it is bad advice: the
 * money drains straight back out. The alternative the household asked for is a
 * LIMIT — raise it and the buffer fills from the plan, without anyone finding a
 * lump sum.
 *
 * The search is over the real model, not a formula, because raising a limit does
 * two things at once: it speeds up accrual AND it shrinks the target (fewer
 * months go over). A formula that ignores the second overshoots badly.
 */
import { describe, test, expect } from "bun:test";
import { smallestSufficientLimit } from "../../src/domain/suggest-limit";

/**
 * Clothes, from the live budget: limit 150, eleven closed months spending
 * 0 0 50 0 0 0 1712 399 171 0 0 — a mean of 212 against a 150 limit, so it
 * cannot accrue a groszy today.
 */
const CLOTHES_SPEND = [0, 0, 50, 0, 0, 0, 1712, 399, 171, 0, 0].map((z) =>
  BigInt(z * 100),
);

/** Deepest trough of (limit − spend), walked from zero. */
const neededAt = (spend: readonly bigint[]) => (limitCents: bigint) => {
  let running = 0n;
  let trough = 0n;
  for (const spent of spend) {
    running += limitCents - spent;
    if (running < trough) trough = running;
  }
  return -trough;
};

const clothes = {
  neededAt: neededAt(CLOTHES_SPEND),
  heldCents: 300_00n,
  meanSpendCents: 212_00n,
  currentLimitCents: 150_00n,
  horizonMonths: 12,
};

describe("smallestSufficientLimit — a category that cannot accrue", () => {
  test("suggests a limit ABOVE the mean spend, or nothing can accrue", () => {
    const s = smallestSufficientLimit(clothes)!;
    expect(s.limitCents).toBeGreaterThan(clothes.meanSpendCents);
  });

  test("beats the naive mean + gap/N, because the target moves too", () => {
    // Naive: 212 + 682/12 ≈ 269. Walking the model says ~230: at that limit the
    // history troughs at 321 instead of 982, and 300 is already held.
    const s = smallestSufficientLimit(clothes)!;
    expect(s.limitCents).toBeLessThan(269_00n);
    expect(s.limitCents).toBeGreaterThan(212_00n);
  });

  test("reads as a raise, and says what it costs each month", () => {
    const s = smallestSufficientLimit(clothes)!;
    expect(s.direction).toBe("raise");
    expect(s.deltaCents).toBe(s.limitCents - clothes.currentLimitCents);
    expect(s.deltaCents).toBeGreaterThan(0n);
  });

  test("the suggested limit really does close the gap in the horizon", () => {
    // The property the search exists to guarantee — asserted against the model
    // rather than against a number someone typed.
    const s = smallestSufficientLimit(clothes)!;
    const shortfall = clothes.neededAt(s.limitCents) - clothes.heldCents;
    const accrual = s.limitCents - clothes.meanSpendCents;
    expect(shortfall <= accrual * BigInt(clothes.horizonMonths)).toBe(true);
  });

  test("one groszy lower and it no longer does", () => {
    // Smallest, not merely sufficient.
    const s = smallestSufficientLimit(clothes)!;
    const lower = s.limitCents - 1n;
    const shortfall = clothes.neededAt(lower) - clothes.heldCents;
    const accrual = lower - clothes.meanSpendCents;
    expect(shortfall <= accrual * BigInt(clothes.horizonMonths)).toBe(false);
  });

  test("a shorter horizon asks for a bigger limit", () => {
    const year = smallestSufficientLimit(clothes)!;
    const quarter = smallestSufficientLimit({ ...clothes, horizonMonths: 3 })!;
    expect(quarter.limitCents).toBeGreaterThanOrEqual(year.limitCents);
  });

  test("says how many months it takes, not just that it works", () => {
    const s = smallestSufficientLimit(clothes)!;
    expect(s.fillMonths).toBeGreaterThanOrEqual(0);
    expect(s.fillMonths).toBeLessThanOrEqual(clothes.horizonMonths);
  });
});

describe("smallestSufficientLimit — a category holding more than it needs", () => {
  // Same history, but the buffer is already fat. The mirror question: how far
  // can the limit come DOWN and still leave a sufficient buffer? Every złoty it
  // drops is a złoty back in the plan.
  const overheld = { ...clothes, heldCents: 2000_00n, currentLimitCents: 400_00n };

  test("suggests a lower limit and reads as one", () => {
    const s = smallestSufficientLimit(overheld)!;
    expect(s.limitCents).toBeLessThan(overheld.currentLimitCents);
    expect(s.direction).toBe("lower");
    expect(s.deltaCents).toBeLessThan(0n);
  });

  test("the buffer still covers the history at the lower limit", () => {
    const s = smallestSufficientLimit(overheld)!;
    const shortfall = overheld.neededAt(s.limitCents) - overheld.heldCents;
    const accrual =
      s.limitCents > overheld.meanSpendCents
        ? s.limitCents - overheld.meanSpendCents
        : 0n;
    expect(shortfall <= accrual * BigInt(overheld.horizonMonths)).toBe(true);
  });

  test("nothing to say when the limit is already the smallest sufficient one", () => {
    const s = smallestSufficientLimit(clothes)!;
    const settled = smallestSufficientLimit({
      ...clothes,
      currentLimitCents: s.limitCents,
    });
    expect(settled).toBeNull();
  });
});

describe("smallestSufficientLimit — the edges", () => {
  test("a category with no history has nothing to suggest", () => {
    expect(
      smallestSufficientLimit({
        neededAt: () => 0n,
        heldCents: 0n,
        meanSpendCents: 0n,
        currentLimitCents: 0n,
        horizonMonths: 12,
      }),
    ).toBeNull();
  });

  test("suggests it even when it is plainly unaffordable", () => {
    // The household's call, not ours (260807): print the number and let them
    // judge. A category spending 50,000 a month gets a 50,000 suggestion.
    const huge = {
      neededAt: neededAt([BigInt(50_000 * 100)]),
      heldCents: 0n,
      meanSpendCents: BigInt(50_000 * 100),
      currentLimitCents: 100_00n,
      horizonMonths: 12,
    };
    const s = smallestSufficientLimit(huge)!;
    expect(s.limitCents).toBeGreaterThan(BigInt(40_000 * 100));
  });

  test("a horizon of zero months demands the buffer outright", () => {
    // Nothing can accrue in no time, so the only sufficient limit is one whose
    // history never troughs below what is already held.
    const s = smallestSufficientLimit({ ...clothes, horizonMonths: 0 })!;
    expect(clothes.neededAt(s.limitCents) <= clothes.heldCents).toBe(true);
  });
});

describe("smallestSufficientLimit — it never suggests a limit you would overspend", () => {
  // Found by running this against the live budget (260807): Subscriptions holds
  // 1,811 against a need of 0, so the search happily proposed a limit of ZERO —
  // arithmetically sufficient, and nonsense as advice. A limit below what a
  // category actually spends is not a plan, it is a standing overspend, and it
  // drains the very buffer it was asked to size.
  const fat = {
    neededAt: (limit: bigint) => {
      // 11 months at a steady 69.
      let running = 0n;
      let trough = 0n;
      for (let i = 0; i < 11; i++) {
        running += limit - 69_00n;
        if (running < trough) trough = running;
      }
      return -trough;
    },
    heldCents: 1811_00n,
    meanSpendCents: 69_00n,
    currentLimitCents: 234_00n,
    horizonMonths: 12,
  };

  test("floors the suggestion at the category's own mean spend", () => {
    const s = smallestSufficientLimit(fat)!;
    expect(s.limitCents).toBe(fat.meanSpendCents);
    expect(s.direction).toBe("lower");
  });

  test("still frees the difference, just not more than there is to free", () => {
    const s = smallestSufficientLimit(fat)!;
    expect(s.deltaCents).toBe(69_00n - 234_00n);
  });

  test("says nothing when the limit is already at the mean", () => {
    expect(
      smallestSufficientLimit({ ...fat, currentLimitCents: 69_00n }),
    ).toBeNull();
  });
});

describe("smallestSufficientLimit — a change too small to act on", () => {
  // Live budget again (260807): Food & Home's mean spend sits a few groszy from
  // its limit, so the search found a "better" limit 0.30 away. A tooltip saying
  // "raise the limit to 110 zł (+0 zł/mo)" is noise dressed as advice.
  const nearlyRight = {
    neededAt: (limit: bigint) => (limit >= 110_30n ? 0n : 500n),
    heldCents: 0n,
    meanSpendCents: 110_30n,
    currentLimitCents: 110_00n,
    horizonMonths: 12,
  };

  test("says nothing when the move is under a whole unit", () => {
    expect(smallestSufficientLimit(nearlyRight)).toBeNull();
  });

  test("still speaks when the move is a whole unit or more", () => {
    const s = smallestSufficientLimit({
      ...nearlyRight,
      currentLimitCents: 109_00n,
    });
    expect(s).not.toBeNull();
    expect(s!.deltaCents).toBe(130n);
  });
});
