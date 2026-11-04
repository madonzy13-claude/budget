/**
 * get-reserve-fit-golden.test.ts — the limit search is an optimisation target
 * (CPU profile, 261102), so its OUTPUT is pinned byte for byte.
 *
 * A seeded, lumpy budget — dozens of categories, three years of history, rules
 * of every cadence, one-offs ahead, an open month that draws on the reserve (or
 * does not reconcile) — is run through getReserveFit and the whole DTO hashed.
 * The hash was taken from the implementation BEFORE the search was made cheap:
 * any change that moves a single cent of any row fails here.
 */
import { describe, test, expect, spyOn } from "bun:test";
import { createHash } from "node:crypto";
import { ok } from "@budget/shared-kernel";
import {
  getReserveFit,
  type GetReserveFitDeps,
} from "../../src/application/get-reserve-fit";
import * as projectedMonthlyModule from "../../src/domain/projected-monthly";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BUDGET = "22222222-2222-4222-8222-222222222222";
const OPEN_MONTH = "2026-09";
const MONTHS = Array.from({ length: 36 }, (_, i) => {
  const z = 2023 * 12 + 8 + i;
  return `${Math.floor(z / 12)}-${String((z % 12) + 1).padStart(2, "0")}`;
});

export function goldenDeps(categories: number, seed = 42): GetReserveFitDeps {
  const rnd = mulberry32(seed);
  const int = (lo: number, hi: number) => lo + Math.floor(rnd() * (hi - lo));
  const cats = Array.from({ length: categories }, (_, i) => {
    const id = `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
    const limit = rnd() < 0.08 ? 0 : int(100, 5000) * 100;
    const spend = MONTHS.map(() =>
      rnd() < 0.15 ? int(2000, 20000) * 100 : int(50, 3000) * 100,
    );
    const carriedIn = int(0, 30000) * 100;
    const openSpend = int(0, 9000) * 100;
    const overage = Math.max(0, openSpend - limit);
    const used = Math.min(overage, carriedIn);
    const reconciles = rnd() < 0.8;
    return {
      id,
      limit,
      spend,
      created: MONTHS[int(0, 20)]!,
      archived: rnd() < 0.05 ? MONTHS[int(25, 35)]! : null,
      cell: {
        usedCents: BigInt(reconciles ? used : used + 1234),
        overspentCents: 0n,
        overageCents: BigInt(overage),
        leftCents: BigInt(Math.max(0, limit - openSpend)),
        endReserveCents: BigInt(carriedIn - used),
      },
      hasCell: rnd() < 0.9,
    };
  });
  const cadences = ["ONCE", "MONTHLY", "YEARLY", "WEEKLY"] as const;
  const rules = cats.flatMap((c) =>
    Array.from({ length: int(0, 5) }, () => {
      const cadence = cadences[int(0, cadences.length)]!;
      const due = `${int(2026, 2029)}-${String(int(1, 13)).padStart(2, "0")}-15`;
      return {
        category_id: c.id,
        amount_cents: BigInt(int(10, 8000) * 100),
        cadence,
        yearly_month: cadence === "YEARLY" ? int(1, 13) : null,
        next_due_date: due < "2026-09-22" ? "2026-10-15" : due,
        currency: "PLN",
      };
    }),
  );
  return {
    overviewRepo: {
      categoryWindows: async () =>
        cats.map((c, i) => ({
          category_id: c.id,
          name: `Cat ${i}`,
          created_month: c.created,
          archived_month: c.archived,
          is_investment: false,
        })),
      monthlyPlannedByCategory: async (
        _budgetId: string,
        from: string,
        to: string,
      ) =>
        cats
          .flatMap((c) =>
            [...MONTHS, OPEN_MONTH].map((month) => ({
              category_id: c.id,
              month,
              planned_cents: BigInt(c.limit),
            })),
          )
          .filter(
            (r) => r.month >= from.slice(0, 7) && r.month <= to.slice(0, 7),
          ),
      monthlySpendByCategory: async () =>
        cats.flatMap((c) =>
          MONTHS.map((month, i) => ({
            category_id: c.id,
            month,
            spent_cents: BigInt(c.spend[i]!),
            scheduled_cents: BigInt(Math.floor(c.spend[i]! / 10)),
          })),
        ),
    } as unknown as GetReserveFitDeps["overviewRepo"],
    activeScheduledPayments: async () => rules,
    fxProvider: {
      rateAsOf: async () => ({ rate: "1" }),
    } as unknown as GetReserveFitDeps["fxProvider"],
    exclusionsRepo: {
      largeTransactions: async () => [],
      excludedSpendByCategory: async () => [],
    },
    reservePositions: async () =>
      ok({
        positions: new Map(
          cats.map((c) => [
            c.id,
            {
              categoryId: c.id,
              reserveCents: c.cell.endReserveCents,
              usedCents: c.cell.usedCents,
              overspentCents: 0n,
              reserveExcluded: false,
              byMonth: c.hasCell ? new Map([[OPEN_MONTH, c.cell]]) : new Map(),
            },
          ]),
        ),
        openMonth: OPEN_MONTH,
        internalCents: 0n,
        userDefinedCents: 0n,
        surplusCents: 0n,
      }) as never,
    metaReader: {
      getBudgetMeta: async () => ({ default_currency: "PLN" }),
    },
    now: () => new Date("2026-09-22T00:00:00Z"),
  };
}

export const runGolden = async (deps: GetReserveFitDeps) => {
  const res = await getReserveFit(deps)({
    tenantId: BUDGET,
    budgetId: BUDGET,
    from: "2023-09-01",
    to: "2026-09-30",
  });
  if (res.isErr()) throw res.error;
  return res.value;
};

// 14-23 added a per-row `currency` label; the hash pins the numbers, so the
// label is stripped before hashing.
const unlabel = (v: unknown) => {
  const d = v as { rows?: object[]; projected_by_category?: object[] };
  const strip = (xs?: object[]) => xs?.map(({ currency: _c, ...rest }: { currency?: unknown }) => rest);
  return { ...d, rows: strip(d.rows), projected_by_category: strip(d.projected_by_category) };
};
const sha = (v: unknown) =>
  createHash("sha256")
    .update(JSON.stringify(unlabel(v), (_k, x) => (typeof x === "bigint" ? `${x}n` : x)))
    .digest("hex");

describe("Reserve fit golden output", () => {
  test("a seeded 60-category budget reads exactly as before the search was optimised", async () => {
    const out = await runGolden(goldenDeps(60));
    expect(out.rows.length).toBeGreaterThan(40);
    expect(out.rows.some((r) => r.suggested_limit_cents !== null)).toBe(true);
    expect(sha(out)).toBe(
      "08a3ccd81610c4fb4deba7ceb7aa8a8133f443e4f5b03d227a884da6d7f2faba",
    );
  });

  test("other seeds pin too", async () => {
    const hashes = await Promise.all(
      [1, 7, 99].map(async (s) => sha(await runGolden(goldenDeps(25, s)))),
    );
    expect(hashes).toEqual([
      "d95c4465a70d966c0d37a8ff7e3c794892ce1f9f7b7b04a2a0ee993f246b5147",
      "1422bc154a74cd8af3736fc2755f831a41333e557d0add160f8b898bd9827091",
      "7c704993887acc9e15a96868e28ea26328efc98940929320d6d93949e0334bc1",
    ]);
  });

  // Deterministic, not a stopwatch: the search asks for the projection at
  // ~30 candidate limits per row, but above the open month's spend every
  // candidate leaves the SAME reserve — so the projection is computed once per
  // distinct reserve, not once per candidate. Before the cache: 1,700+ calls.
  test("perf guard: the projection is computed once per distinct reserve, not per candidate limit", async () => {
    const spy = spyOn(projectedMonthlyModule, "projectedMonthly");
    try {
      const out = await runGolden(goldenDeps(60));
      expect(spy.mock.calls.length).toBeLessThan(out.rows.length * 12);
    } finally {
      spy.mockRestore();
    }
  });
});
