/**
 * cashflow-multi-currency.test.ts — the cash-flow projection and the scheduled
 * monthly cost read the same money identically whether it was entered in EUR
 * or already in PLN (Phase 14, D-02 / D-08). Fixture: twin-budgets-fixture.ts.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { ok } from "@budget/shared-kernel";
import { computeCashflowProjection } from "../../src/application/compute-cashflow-projection";
import { computeScheduledMonthly } from "../../src/application/compute-scheduled-monthly";
import { createTwins, endTwins, fxProvider, normalise, type Twin } from "./twin-budgets-fixture";

let eur: Twin;
let pln: Twin;
const deps = {
  fxProvider,
  reservePositions: async () => ok({ userDefinedCents: 0n, positions: new Map() }),
};

beforeAll(async () => {
  ({ eur, pln } = await createTwins());
}, 180_000);
afterAll(() => endTwins());

describe("Cash flow in mixed currencies", () => {
  const project = (t: Twin) =>
    computeCashflowProjection(deps as never)({ tenantId: t.tenant, budgetId: t.tenant });

  test("a EUR budget projects exactly like its PLN twin", async () => {
    expect(normalise(await project(eur), eur)).toBe(normalise(await project(pln), pln));
  });

  test("an unconfirmed payment counts at its own date's rate", async () => {
    const [a, b] = [await project(eur), await project(pln)];
    expect(a.pendingPoints.map((p) => p.amountCents)).toEqual(b.pendingPoints.map((p) => p.amountCents));
  });
});

describe("Scheduled monthly cost in mixed currencies", () => {
  test("past spend converts at each transaction's date", async () => {
    const run = async (t: Twin) =>
      [...(await computeScheduledMonthly({ fxProvider } as never)({ tenantId: t.tenant, budgetId: t.tenant, currency: "PLN" })).values()];
    expect(await run(eur)).toEqual(await run(pln));
  });
});
