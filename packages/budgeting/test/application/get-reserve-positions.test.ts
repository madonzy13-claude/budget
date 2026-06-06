/**
 * get-reserve-positions.test.ts — the replay orchestrator (event-loader → engine).
 *
 * The OLD accrued/funded/expected/real model is GONE. These tests pin that the
 * orchestrator:
 *   1. maps the loader's ReserveEventInputs to a chronological ReserveEngineEvent[],
 *   2. folds them through reserve-engine, and
 *   3. returns per-category {reserveCents, usedCents, overspentCents} + internal +
 *      userDefined + surplus + direction.
 *
 * The golden reproduction encodes the FINAL-STATE loader inputs that the 29-row
 * golden table (05-REWRITE-SPEC.md) collapses to in its single open month —
 * single open month 2026-06, final spend/limits, the ordered signed adjustment
 * deltas (decision E), Σ RESERVE-wallet userDefined. The last golden row is:
 *   Grocery R 1300, Housing R 800, internal 2100, userDefined 3000, surplus 900.
 * Cents: 130000 / 80000 / 210000 / 300000 / 90000 → direction WITHDRAW (surplus>0).
 */
import { describe, it, expect } from "bun:test";
import {
  getReservePositions,
  mapInputsToEvents,
} from "../../src/application/get-reserve-positions";
import type {
  ReserveEventInputs,
  ReserveEventLoaderRepo,
} from "../../src/ports/reserve-event-loader-repo";

const TENANT = "t1";
const BUDGET = "b1";
const G = "Grocery";
const H = "Housing";
const OPEN = "2026-06";

/** A fake loader returning hand-built ReserveEventInputs (no DB). */
function fakeLoader(inputs: ReserveEventInputs): ReserveEventLoaderRepo {
  return {
    async load(_tenant, _budget, override) {
      // Honour the open-month override when given (mirrors the real adapter).
      if (override) return { ...inputs, openMonth: override };
      return inputs;
    },
  };
}

/**
 * Final-state loader inputs the golden table collapses to (derived by replaying
 * the 29 golden actions through the engine; see 05-12-SUMMARY for the table).
 * Grocery: spent 1800, normal limit 400 (cushion 300), adjust deltas
 * [100, 1100, 1500] cents-as-major → [10000,110000,150000].
 * Housing: spent 1600, normal limit 1000 (cushion 250), adjust deltas
 * [300,-50,-250,400,1000] major → [30000,-5000,-25000,40000,100000].
 * userDefined 3000 (300000c), cushion off.
 */
function goldenInputs(
  over: Partial<ReserveEventInputs> = {},
): ReserveEventInputs {
  return {
    spendByCategoryByMonth: new Map([
      [G, new Map([[OPEN, 180000n]])],
      [H, new Map([[OPEN, 160000n]])],
    ]),
    limitsByMonth: new Map([
      [
        OPEN,
        new Map([
          [G, { plannedCents: 40000n, cushionCents: 30000n }],
          [H, { plannedCents: 100000n, cushionCents: 25000n }],
        ]),
      ],
    ]),
    cushionHistory: [],
    adjustmentsByCategory: new Map([
      [
        G,
        [10000n, 110000n, 150000n].map((deltaCents) => ({
          deltaCents,
          month: OPEN,
        })),
      ],
      [
        H,
        [30000n, -5000n, -25000n, 40000n, 100000n].map((deltaCents) => ({
          deltaCents,
          month: OPEN,
        })),
      ],
    ]),
    categoryFlags: new Map([
      [
        G,
        {
          reserveExcluded: false,
          archivedAt: null,
          archivedFrom: null,
          sortIndex: 0,
          name: "Grocery",
        },
      ],
      [
        H,
        {
          reserveExcluded: false,
          archivedAt: null,
          archivedFrom: null,
          sortIndex: 1,
          name: "Housing",
        },
      ],
    ]),
    userDefinedCents: 300000n,
    reservesEnabled: true,
    openMonth: OPEN,
    budgetCurrency: "EUR",
    ...over,
  };
}

const run = (inputs: ReserveEventInputs, month?: string) =>
  getReservePositions({ eventLoader: fakeLoader(inputs) })({
    tenantId: TENANT,
    budgetId: BUDGET,
    month,
  });

describe("getReservePositions — replay orchestrator", () => {
  it("reproduces the golden final row through loader → engine", async () => {
    const r = await run(goldenInputs());
    expect(r.isOk()).toBe(true);
    if (!r.isOk()) return;
    const v = r.value;
    expect(v.positions.get(G)!.reserveCents).toBe(130000n);
    expect(v.positions.get(H)!.reserveCents).toBe(80000n);
    expect(v.internalCents).toBe(210000n);
    expect(v.userDefinedCents).toBe(300000n);
    expect(v.surplusCents).toBe(90000n);
    expect(v.direction).toBe("WITHDRAW");
    // last golden row: both categories fully covered → overspent 0.
    expect(v.positions.get(G)!.overspentCents).toBe(0n);
    expect(v.positions.get(H)!.overspentCents).toBe(0n);
    // per-month cell for the open month is exposed for the spendings grid.
    const gCell = v.positions.get(G)!.byMonth.get(OPEN);
    expect(gCell?.usedCents).toBe(140000n); // Grocery used the reserve to cover overage
    expect(gCell?.overspentCents).toBe(0n);
  });

  it("direction = TOPUP when internal exceeds userDefined (surplus<0)", async () => {
    const r = await run(goldenInputs({ userDefinedCents: 0n }));
    expect(r.isOk()).toBe(true);
    if (!r.isOk()) return;
    expect(r.value.userDefinedCents).toBe(0n);
    expect(r.value.internalCents).toBe(210000n);
    expect(r.value.surplusCents).toBe(-210000n);
    expect(r.value.direction).toBe("TOPUP");
  });

  it("direction = NONE when userDefined exactly matches internal (surplus 0)", async () => {
    const r = await run(goldenInputs({ userDefinedCents: 210000n }));
    expect(r.isOk()).toBe(true);
    if (!r.isOk()) return;
    expect(r.value.surplusCents).toBe(0n);
    expect(r.value.direction).toBe("NONE");
  });

  it("reservesEnabled=false (decision K): used→overspent, internal hidden", async () => {
    const r = await run(goldenInputs({ reservesEnabled: false }));
    expect(r.isOk()).toBe(true);
    if (!r.isOk()) return;
    expect(r.value.internalCents).toBe(0n);
    expect(r.value.surplusCents).toBe(300000n); // userDefined − 0
    // Every position reads used=0; overspent = full overage for its months.
    for (const pos of r.value.positions.values()) {
      expect(pos.usedCents).toBe(0n);
      for (const cell of pos.byMonth.values()) {
        expect(cell.usedCents).toBe(0n);
        expect(cell.overspentCents).toBe(cell.overageCents);
      }
    }
  });

  it("excluded category drops out of internal", async () => {
    // Exclude Housing → internal = Grocery R only (130000).
    const inputs = goldenInputs();
    inputs.categoryFlags.set(H, {
      reserveExcluded: true,
      archivedAt: null,
      archivedFrom: null,
      sortIndex: 1,
      name: "Housing",
    });
    const r = await run(inputs);
    expect(r.isOk()).toBe(true);
    if (!r.isOk()) return;
    expect(r.value.internalCents).toBe(130000n);
  });

  it("returns err('invalid_month') for a malformed month override", async () => {
    const r = await run(goldenInputs(), "2026-6");
    expect(r.isErr()).toBe(true);
    expect(r.isErr() && r.error.message).toBe("invalid_month");
  });

  it("surfaces a loader failure as err()", async () => {
    const loader: ReserveEventLoaderRepo = {
      async load() {
        throw new Error("budget_not_found");
      },
    };
    const r = await getReservePositions({ eventLoader: loader })({
      tenantId: TENANT,
      budgetId: BUDGET,
    });
    expect(r.isErr()).toBe(true);
    expect(r.isErr() && r.error.message).toBe("budget_not_found");
  });
});

describe("mapInputsToEvents — chronological mapping", () => {
  it("emits accrual ONLY for closed months, after that month's spend/limit", () => {
    const inputs = goldenInputs({
      spendByCategoryByMonth: new Map([
        [
          G,
          new Map([
            ["2026-05", 5000n],
            [OPEN, 180000n],
          ]),
        ],
      ]),
      limitsByMonth: new Map([
        [
          "2026-05",
          new Map([[G, { plannedCents: 20000n, cushionCents: 20000n }]]),
        ],
        [OPEN, new Map([[G, { plannedCents: 40000n, cushionCents: 30000n }]])],
      ]),
      adjustmentsByCategory: new Map(),
    });
    const events = mapInputsToEvents(inputs);
    // accrual exists for the closed month, never for the open month.
    const accrualMonths = events
      .filter((e) => e.type === "accrual")
      .map((e) => (e as { month: string }).month);
    expect(accrualMonths).toContain("2026-05");
    expect(accrualMonths).not.toContain(OPEN);
    // ordering: the 2026-05 accrual comes after its setLimit + spendDelta.
    const idxLimit = events.findIndex(
      (e) => e.type === "setLimit" && (e as any).month === "2026-05",
    );
    const idxSpend = events.findIndex(
      (e) => e.type === "spendDelta" && (e as any).month === "2026-05",
    );
    const idxAccrual = events.findIndex(
      (e) => e.type === "accrual" && (e as any).month === "2026-05",
    );
    expect(idxAccrual).toBeGreaterThan(idxLimit);
    expect(idxAccrual).toBeGreaterThan(idxSpend);
  });

  it("appends adjust deltas in stored order, after open-month spend, then setUserDefined last", () => {
    const events = mapInputsToEvents(goldenInputs());
    const adjustG = events.filter(
      (e) => e.type === "adjust" && (e as any).categoryId === G,
    ) as Array<{ deltaCents: bigint }>;
    expect(adjustG.map((e) => e.deltaCents)).toEqual([
      10000n,
      110000n,
      150000n,
    ]);
    // setUserDefined is the final event.
    expect(events[events.length - 1].type).toBe("setUserDefined");
    // every adjust precedes setUserDefined and follows the open-month spend.
    const idxSpend = events.findIndex(
      (e) => e.type === "spendDelta" && (e as any).month === OPEN,
    );
    const idxFirstAdjust = events.findIndex((e) => e.type === "adjust");
    expect(idxFirstAdjust).toBeGreaterThan(idxSpend);
  });
});
