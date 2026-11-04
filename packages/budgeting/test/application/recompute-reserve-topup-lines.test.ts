/**
 * recompute-reserve-topup-lines.test.ts — review WR-05. Once settled, every
 * line shares the net's direction, except a currency with no rate, which sits
 * outside the net on its own line and can point the other way. The task title
 * reads one verb over all its lines ("Top up 0.68 EUR and 0.05 PLN"), so a
 * line in the other direction must not ride along, and a settlement whose
 * every line is unconvertible (no net, direction null) takes its direction
 * from the lines rather than a "Top up 0" from the empty net.
 */
import { describe, test, expect } from "bun:test";
import { ok } from "@budget/shared-kernel";
import { recomputeReserveTopupTask } from "../../src/application/recompute-reserve-topup-task";
import type { ReserveTopupPayload } from "../../src/ports/task-repo";

const run = async (settlement: Record<string, unknown>, surplus = 0n) => {
  const emitted: ReserveTopupPayload[] = [];
  await recomputeReserveTopupTask({ execute: async () => ({ rows: [] }) }, { tenantId: "t", budgetId: "t" }, {
    taskRepo: {
      emitReserveTopup: async (_t: string, _b: string, p: ReserveTopupPayload) => void emitted.push(p),
      resolveByKindAndBudget: async () => {},
    } as never,
    reservePositions: async () => ok({ surplusCents: surplus, settlement } as never),
    budgetCurrencyOf: async () => "EUR",
    isReservesEnabled: async () => true,
  });
  return emitted[0];
};

describe("RESERVE_TOPUP lines", () => {
  test("a line against the net's direction is left out of the task", async () => {
    const p = await run(
      {
        direction: "TOPUP",
        netBudgetCents: -68n,
        unconvertible: ["XAU"],
        lines: [
          { currency: "EUR", cents: 68n, direction: "TOPUP" },
          { currency: "XAU", cents: 5n, direction: "WITHDRAW" },
        ],
      },
      -68n,
    );
    expect(p?.direction).toBe("TOPUP");
    expect(p?.lines?.map((l) => l.currency)).toEqual(["EUR"]);
  });

  test("only unconvertible lines: the direction and amount come from them", async () => {
    const p = await run({
      direction: null,
      netBudgetCents: 0n,
      unconvertible: ["XAU"],
      lines: [{ currency: "XAU", cents: 5n, direction: "WITHDRAW" }],
    });
    expect(p?.direction).toBe("WITHDRAW");
    expect(p?.lines).toEqual([{ currency: "XAU", shortfall_cents: "5", direction: "WITHDRAW" }]);
    expect(p?.shortfall_cents).not.toBe("0");
  });
});
