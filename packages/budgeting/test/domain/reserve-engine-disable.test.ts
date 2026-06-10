/**
 * reserve-engine-disable.test.ts — Decision K (disable / re-enable).
 *
 * Disable = read-transform only: every category reports used→overspent (full overage),
 * internal hidden (0). It MUST NOT mutate underlying state — so re-enabling and replaying
 * the same history reproduces the exact pre-disable R/U/overspent. The round-trip is
 * idempotent (disable→enable = no net change).
 */
import { describe, test, expect } from "bun:test";
import {
  reserveEngine,
  type ReserveEngineEvent,
  type ReserveEngineResult,
} from "../../src/domain/reserve-engine";

const G = "Grocery";
const H = "Housing";

// A non-trivial multi-month history: two categories, two closed months, accrual after
// each, a manual adjustment, partial reserve coverage (so some cells have used > 0),
// and a userDefined amount.
const events: ReserveEngineEvent[] = [
  {
    type: "setLimit",
    categoryId: G,
    month: "2026-01",
    normalCents: 30000n,
    cushionCents: 30000n,
  },
  { type: "adjust", categoryId: G, deltaCents: 50000n, month: "2026-01" }, // Grocery reserve 500 (made in the then-open month)
  { type: "spendDelta", categoryId: G, month: "2026-01", deltaCents: 40000n }, // overage 100 → used 100
  { type: "accrual", categoryId: G, month: "2026-01" },
  {
    type: "setLimit",
    categoryId: G,
    month: "2026-02",
    normalCents: 30000n,
    cushionCents: 30000n,
  },
  { type: "spendDelta", categoryId: G, month: "2026-02", deltaCents: 50000n }, // overage 200 → used 200
  { type: "accrual", categoryId: G, month: "2026-02" },

  {
    type: "setLimit",
    categoryId: H,
    month: "2026-01",
    normalCents: 50000n,
    cushionCents: 25000n,
  },
  { type: "spendDelta", categoryId: H, month: "2026-01", deltaCents: 20000n }, // under → left 300
  { type: "accrual", categoryId: H, month: "2026-01" }, // accrue 300 reserve
  {
    type: "setLimit",
    categoryId: H,
    month: "2026-02",
    normalCents: 50000n,
    cushionCents: 25000n,
  },
  { type: "spendDelta", categoryId: H, month: "2026-02", deltaCents: 60000n }, // overage 100 → used 100
  { type: "accrual", categoryId: H, month: "2026-02" },

  { type: "setUserDefined", cents: 300000n },
];

const OPEN = "2026-03";

function sortedCells(r: ReserveEngineResult) {
  return [...r.cells].sort((a, b) =>
    `${a.categoryId}|${a.month}`.localeCompare(`${b.categoryId}|${b.month}`),
  );
}

function expectResultsEqual(
  a: ReserveEngineResult,
  b: ReserveEngineResult,
): void {
  expect(a.internalCents).toBe(b.internalCents);
  expect(a.surplusCents).toBe(b.surplusCents);
  expect(a.userDefinedCents).toBe(b.userDefinedCents);

  const aStates = [...a.states.entries()].sort((x, y) =>
    x[0].localeCompare(y[0]),
  );
  const bStates = [...b.states.entries()].sort((x, y) =>
    x[0].localeCompare(y[0]),
  );
  expect(aStates.length).toBe(bStates.length);
  aStates.forEach(([id, st], i) => {
    expect(bStates[i][0]).toBe(id);
    expect(st.reserveCents).toBe(bStates[i][1].reserveCents);
    expect(st.usedCents).toBe(bStates[i][1].usedCents);
  });

  const ac = sortedCells(a);
  const bc = sortedCells(b);
  expect(ac.length).toBe(bc.length);
  ac.forEach((c, i) => {
    expect(bc[i].categoryId).toBe(c.categoryId);
    expect(bc[i].month).toBe(c.month);
    expect(bc[i].overageCents).toBe(c.overageCents);
    expect(bc[i].leftCents).toBe(c.leftCents);
    expect(bc[i].usedCents).toBe(c.usedCents);
    expect(bc[i].overspentCents).toBe(c.overspentCents);
  });
}

describe("reserveEngine — disable / re-enable (decision K)", () => {
  const enabled = reserveEngine({
    events,
    openMonth: OPEN,
    reservesEnabled: true,
  });
  const disabled = reserveEngine({
    events,
    openMonth: OPEN,
    reservesEnabled: false,
  });
  const reEnabled = reserveEngine({
    events,
    openMonth: OPEN,
    reservesEnabled: true,
  });

  test("enabled run actually uses reserve somewhere (guards the test)", () => {
    expect(enabled.cells.some((c) => c.usedCents > 0n)).toBe(true);
  });

  test("disabled: every cell reports used→overspent, internal hidden", () => {
    for (const c of disabled.cells) {
      expect(c.usedCents).toBe(0n);
      expect(c.overspentCents).toBe(c.overageCents);
    }
    expect(disabled.internalCents).toBe(0n);
  });

  test("re-enable is idempotent — identical to the original enabled run", () => {
    expectResultsEqual(reEnabled, enabled);
  });

  test("disable did not mutate underlying running state (R/U preserved)", () => {
    // states are computed the same regardless of the output transform.
    const e = [...enabled.states.entries()].sort((x, y) =>
      x[0].localeCompare(y[0]),
    );
    const d = [...disabled.states.entries()].sort((x, y) =>
      x[0].localeCompare(y[0]),
    );
    e.forEach(([id, st], i) => {
      expect(d[i][0]).toBe(id);
      expect(d[i][1].reserveCents).toBe(st.reserveCents);
      expect(d[i][1].usedCents).toBe(st.usedCents);
    });
  });
});
