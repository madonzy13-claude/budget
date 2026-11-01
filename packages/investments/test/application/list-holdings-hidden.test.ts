/**
 * list-holdings-hidden.test.ts — R6 (user): hiding an asset only takes it off
 * the list. It is still owned, so it still counts — in every share, and in
 * every total that values the portfolio ("all").
 */
import { describe, test, expect } from "bun:test";
import { listHoldings } from "../../src/application/list-holdings";
import { Holding } from "../../src/domain/holding";
import type { HoldingRepo } from "../../src/ports/holding-repo";

const make = (id: string, cents: bigint, hidden: boolean) =>
  new Holding(
    id,
    "t",
    id,
    "other",
    null,
    cents,
    "PLN",
    "1",
    cents,
    "PLN",
    0,
    hidden ? new Date("2026-10-01T00:00:00Z") : null,
    new Date("2026-01-01T00:00:00Z"),
    "collectibles",
  );

// The repo honours the visibility filter, like the real one.
function repo(all: Holding[]): HoldingRepo {
  return {
    listForBudget: async (
      _t: string,
      _b: string,
      _u: string,
      opts?: { hidden?: boolean | "all" },
    ) =>
      opts?.hidden === "all"
        ? all
        : all.filter((h) => (h.archivedAt != null) === (opts?.hidden === true)),
  } as unknown as HoldingRepo;
}

const fx = {
  rateAsOf: async () => ({ rate: "1", provider: "s", isStale: false }),
} as never;
const who = {
  tenantId: "t",
  budgetId: "t",
  actorUserId: "u",
  budgetCurrency: "PLN",
};

describe("hidden assets still count", () => {
  const all = [make("A", 300_000n, false), make("B", 100_000n, true)];

  test("a visible asset's share is of the whole portfolio, hidden included", async () => {
    const r = (
      await listHoldings({ holdingRepo: repo(all), fxProvider: fx })(who)
    )._unsafeUnwrap();
    expect(r.holdings.map((h) => h.id)).toEqual(["A"]);
    expect(r.holdings[0]!.weightPct).toBeCloseTo(75, 5);
  });

  test("a hidden asset keeps its share too", async () => {
    const r = (
      await listHoldings({ holdingRepo: repo(all), fxProvider: fx })({
        ...who,
        hidden: true,
      })
    )._unsafeUnwrap();
    expect(r.holdings.map((h) => h.id)).toEqual(["B"]);
    expect(r.holdings[0]!.weightPct).toBeCloseTo(25, 5);
  });

  test('"all" returns visible and hidden together, for totals', async () => {
    const r = (
      await listHoldings({ holdingRepo: repo(all), fxProvider: fx })({
        ...who,
        hidden: "all",
      })
    )._unsafeUnwrap();
    expect(r.holdings.map((h) => h.id).sort()).toEqual(["A", "B"]);
  });
});
