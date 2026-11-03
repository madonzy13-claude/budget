/**
 * cushion-income-multi-currency.test.ts — the cushion requirement and the
 * income-vs-planned figure convert each limit from its own currency (D-08:
 * today's rate for the current month). Fixture: twin-budgets-fixture.ts.
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { withTenantTx } from "@budget/platform";
import { TenantId, UserId } from "@budget/shared-kernel";
import { getCushionSummary } from "../../src/application/get-cushion-summary";
import { computeIncomeVsPlanned } from "../../src/application/recompute-income-under-planned-task";
import { createTwins, endTwins, fxProvider, type Twin } from "./twin-budgets-fixture";

let eur: Twin;
let pln: Twin;

beforeAll(async () => {
  ({ eur, pln } = await createTwins());
}, 180_000);
afterAll(() => endTwins());

describe("Cushion and planned totals in mixed currencies", () => {
  test("the cushion requirement converts a EUR cushion limit at today's rate", async () => {
    const run = async (t: Twin) =>
      (await getCushionSummary({ fxProvider })({ tenantId: t.tenant, budgetId: t.tenant }))._unsafeUnwrap();
    const [a, b] = [await run(eur), await run(pln)];
    expect(a).toEqual(b);
    // 150 EUR × 4.5 × 2 months.
    expect(a.required_cents).toBe("135000");
  });

  test("planned converts each limit before it is compared with income", async () => {
    const run = async (t: Twin) => {
      const r = await withTenantTx(TenantId(t.tenant), UserId(t.owner), (tx) =>
        computeIncomeVsPlanned(tx as never, { tenantId: t.tenant, budgetId: t.tenant, fxProvider: fxProvider as never }),
      );
      if (r.isErr()) throw r.error;
      return r.value.plannedCents;
    };
    expect(await run(eur)).toBe(90000n);
    expect(await run(pln)).toBe(90000n);
  });
});
