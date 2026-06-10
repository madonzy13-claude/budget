/**
 * reserves-use-cases.test.ts — Unit tests for the Phase 05 reserve-rewrite
 * mutation use cases (05-13). Port-level mocks only (allowed at the application
 * layer — NO DB mocks; integration is covered by apps/api/test + reserve-topup).
 *
 * New model (05-REWRITE-SPEC.md, decisions C/E/J):
 *   - adjust-category-reserve  → append a SIGNED delta (target − currentR); the
 *     orchestrator (reservePositions) is the source of truth for currentR + the
 *     response summary. NO reserve_actual writes, NO greedy allocation.
 *   - set-wallet-balance / update-wallet → set the wallet balance only
 *     (→ userDefined = Σ RESERVE balances). NO category reserve mutation.
 *   - archive-category / archive-wallet / toggle-exclude → drop the reserve
 *     from internal going forward; siblings are INDEPENDENT (no spill/refill).
 *
 * Plan 05-13 / RSRV-REWRITE-USECASES.
 */
import { describe, it, expect } from "bun:test";
import { ok } from "@budget/shared-kernel";
import type {
  ReservePositionsResult,
  ReservePosition,
} from "../../src/application/get-reserve-positions";

// A few use cases (archive-*, toggle-exclude) open a real withTenantTx for the
// A2-fallback RESERVE_TOPUP recompute, even though THIS test mocks taskRepo +
// reservePositions (port level). When DATABASE_URL_APP points at the in-cluster
// `@db:` host, the tx connection fails DNS from the test runner — so apply the
// same `@db:` → `@localhost:` fixup the integration tests use, and reset pools.
// (The recompute's emit/resolve DIRECTION + idempotency is integration-tested in
//  test/tasks/reserve-topup.test.ts against real Postgres.)
if (process.env.DATABASE_URL_APP) {
  process.env.DATABASE_URL_APP = process.env.DATABASE_URL_APP.replace(
    "@db:",
    "@localhost:",
  );
}
const { resetPools } = await import("@budget/platform");
resetPools();

const noopRepoMethods = {
  create: async () => {},
  list: async () => [],
  archive: async () => {},
  setBalance: async () => {},
  update: async () => {},
};

/** Build a fake ReservePositionsResult from per-category reserve cents +
 *  userDefined. internal = Σ reserveCents; surplus = userDefined − internal. */
function fakePositions(opts: {
  reservesByCat?: Record<string, bigint>;
  usedByCat?: Record<string, bigint>;
  overspentByCat?: Record<string, bigint>;
  userDefinedCents?: bigint;
  /** Override internal (e.g. to model an excluded/archived category dropping
   *  out of internal while still appearing in positions). Defaults to Σ. */
  internalCents?: bigint;
}): ReservePositionsResult {
  const reserves = opts.reservesByCat ?? {};
  const positions = new Map<string, ReservePosition>();
  for (const [categoryId, reserveCents] of Object.entries(reserves)) {
    positions.set(categoryId, {
      categoryId,
      reserveCents,
      usedCents: opts.usedByCat?.[categoryId] ?? 0n,
      overspentCents: opts.overspentByCat?.[categoryId] ?? 0n,
      byMonth: new Map(),
    });
  }
  const internalCents =
    opts.internalCents ?? Object.values(reserves).reduce((a, b) => a + b, 0n);
  const userDefinedCents = opts.userDefinedCents ?? 0n;
  const surplusCents = userDefinedCents - internalCents;
  return {
    positions,
    internalCents,
    userDefinedCents,
    surplusCents,
    direction:
      surplusCents < 0n ? "TOPUP" : surplusCents > 0n ? "WITHDRAW" : "NONE",
  };
}

function mockCategoriesRepo(opts: {
  findById?: any;
  list?: any[];
  capture?: { exclude?: boolean; excludedValue?: boolean };
}) {
  return {
    findById: opts.findById ?? (async () => null),
    list: async () => opts.list ?? [],
    setReserveExcluded: async (_t: string, _c: string, excluded: boolean) => {
      if (opts.capture) {
        opts.capture.exclude = true;
        opts.capture.excludedValue = excluded;
      }
    },
  };
}

// ===========================================================================
// updateWallet — guards preserved; RESERVE branch sets userDefined only
// ===========================================================================
describe("updateWallet use case", () => {
  it("returns not_found when wallet does not exist", async () => {
    const { updateWallet } =
      await import("../../src/application/update-wallet");
    const repo = { ...noopRepoMethods, findById: async () => null } as any;
    const uc = updateWallet({ repo, budgetCurrencyOf: async () => "EUR" });
    const r = await uc({
      tenantId: "t1",
      walletId: "w1",
      actorUserId: "u1",
      name: "New Name",
    });
    expect(r.isErr()).toBe(true);
    expect(r.isErr() && r.error.message).toBe("not_found");
  });

  it("returns reserve_currency_mismatch when RESERVE wallet patches non-budget currency", async () => {
    const { updateWallet } =
      await import("../../src/application/update-wallet");
    const { Wallet } = await import("../../src/domain/wallet");
    const { Money } = await import("@budget/shared-kernel");
    const wallet = new Wallet(
      "w1",
      "t1",
      "Reserve",
      "RESERVE",
      "EUR",
      Money.of("100", "EUR"),
      null,
      new Date(),
      "u1",
    );
    const repo = { ...noopRepoMethods, findById: async () => wallet } as any;
    const uc = updateWallet({ repo, budgetCurrencyOf: async () => "EUR" });
    const r = await uc({
      tenantId: "t1",
      walletId: "w1",
      actorUserId: "u1",
      currency: "USD",
    });
    expect(r.isErr() && r.error.message).toBe("reserve_currency_mismatch");
  });
});

// ===========================================================================
// setWalletBalance — RESERVE balance edit changes userDefined ONLY (decision C)
// ===========================================================================
describe("setWalletBalance use case — userDefined only", () => {
  it("editing a RESERVE wallet returns an engine summary; surplus = userDefined − internal", async () => {
    const { setWalletBalance } =
      await import("../../src/application/set-wallet-balance");
    const { Wallet, Money } = await import("@budget/shared-kernel").then(
      async (sk) => ({
        ...(await import("../../src/domain/wallet")),
        Money: sk.Money,
      }),
    );
    const wallet = new Wallet(
      "w1",
      "t1",
      "Savings",
      "RESERVE",
      "EUR",
      Money.of("150", "EUR"),
      null,
      new Date(),
      "u1",
    );
    const captured: { setBalanceCalledWith: string | null } = {
      setBalanceCalledWith: null,
    };
    const repo = {
      ...noopRepoMethods,
      findById: async () => wallet,
      setBalance: async (_t: string, _w: string, m: { amount: string }) => {
        captured.setBalanceCalledWith = m.amount;
      },
    } as any;

    // After the edit the wallet pool (userDefined) is €200 (20000c). Category G
    // has reserve €100 (10000c) → internal 10000, surplus 20000 − 10000 = 10000.
    const uc = setWalletBalance({
      repo,
      categoriesRepo: mockCategoriesRepo({
        list: [{ id: "G", name: "Groceries", reserveExcluded: false }],
      }) as any,
      budgetCurrencyOf: async () => "EUR",
      isReservesEnabled: async () => true,
      reservePositions: async () =>
        ok(
          fakePositions({
            reservesByCat: { G: 10000n },
            userDefinedCents: 20000n,
          }),
        ),
    } as any);

    const r = await uc({
      tenantId: "t1",
      walletId: "w1",
      amount: "200",
      currency: "EUR",
      actorUserId: "u1",
    });
    expect(r.isOk()).toBe(true);
    expect(captured.setBalanceCalledWith).toBe("200"); // only the wallet balance moved
    if (r.isOk()) {
      // category reserve is UNCHANGED by the wallet edit (engine-derived)
      const G = r.value.summary?.rows.find((x) => x.categoryId === "G");
      expect(G?.reserveCents).toBe("10000");
      expect(r.value.summary?.totals.internalCents).toBe("10000");
      expect(r.value.summary?.totals.userDefinedCents).toBe("20000");
      expect(r.value.summary?.totals.surplusCents).toBe("10000");
      expect(r.value.summary?.totals.direction).toBe("WITHDRAW");
    }
  });
});

// ===========================================================================
// adjustCategoryReserve — delta-only append (decision E)
// ===========================================================================
describe("adjustCategoryReserve use case", () => {
  const baseInput = {
    tenantId: "t1",
    budgetId: "t1",
    categoryId: "c1",
    expectedCents: 100,
    actorUserId: "u1",
  };

  function buildDeps(overrides: any = {}) {
    return {
      adjustmentsRepo: {
        create: async () => ({ id: "adj-x", occurredAt: new Date() }),
        listForCategory: async () => [],
        ...(overrides.adjustmentsRepo ?? {}),
      },
      categoriesRepo: overrides.categoriesRepo ?? mockCategoriesRepo({}),
      isReservesEnabled: overrides.isReservesEnabled ?? (async () => true),
      budgetCurrencyOf: overrides.budgetCurrencyOf ?? (async () => "EUR"),
      reservePositions:
        overrides.reservePositions ?? (async () => ok(fakePositions({}))),
    };
  }

  it("returns reserves_disabled when reserves are disabled", async () => {
    const { adjustCategoryReserve } =
      await import("../../src/application/adjust-category-reserve");
    const uc = adjustCategoryReserve(
      buildDeps({ isReservesEnabled: async () => false }),
    );
    const r = await uc(baseInput);
    expect(r.isErr() && r.error.message).toBe("reserves_disabled");
  });

  it("returns not_found when category does not exist", async () => {
    const { adjustCategoryReserve } =
      await import("../../src/application/adjust-category-reserve");
    const uc = adjustCategoryReserve(buildDeps({}));
    const r = await uc(baseInput);
    expect(r.isErr() && r.error.message).toBe("not_found");
  });

  it("returns category_excluded when reserveExcluded=true", async () => {
    const { adjustCategoryReserve } =
      await import("../../src/application/adjust-category-reserve");
    const uc = adjustCategoryReserve(
      buildDeps({
        categoriesRepo: mockCategoriesRepo({
          findById: async () => ({
            id: "c1",
            name: "X",
            reserveExcluded: true,
            archivedAt: null,
            sortIndex: 0,
          }),
        }),
      }),
    );
    const r = await uc(baseInput);
    expect(r.isErr() && r.error.message).toBe("category_excluded");
  });

  it("appends delta = target − currentR (raise); NO actual write", async () => {
    const { adjustCategoryReserve } =
      await import("../../src/application/adjust-category-reserve");
    const cap: { ledgerDelta: bigint | null } = { ledgerDelta: null };

    // currentR for c1 = 100c. Set target 500c → delta = +400c.
    const uc = adjustCategoryReserve(
      buildDeps({
        adjustmentsRepo: {
          create: async (i: any) => {
            cap.ledgerDelta = i.deltaCents;
            return { id: "adj-x", occurredAt: new Date() };
          },
        },
        categoriesRepo: mockCategoriesRepo({
          findById: async () => ({
            id: "c1",
            name: "Food",
            reserveExcluded: false,
            archivedAt: null,
            sortIndex: 1,
          }),
          list: [{ id: "c1", name: "Food", reserveExcluded: false }],
        }),
        // Stateful: the FIRST read is currentR (100 → delta +400); the read AFTER
        // the write reflects the engine resolving R to the target (no overspend
        // here, so the settled reserve == target 500). The use case now returns
        // the SETTLED reserve from this post-write summary, not the raw target.
        reservePositions: (() => {
          let n = 0;
          return async () => {
            n += 1;
            return ok(
              fakePositions({ reservesByCat: { c1: n === 1 ? 100n : 500n } }),
            );
          };
        })(),
      }),
    );

    const r = await uc({ ...baseInput, expectedCents: 500 });
    expect(r.isOk()).toBe(true);
    expect(cap.ledgerDelta).toBe(400n);
    if (r.isOk()) {
      expect(r.value.deltaCents).toBe("400");
      expect(r.value.reserveCents).toBe("500"); // settled == target (no cover)
    }
  });

  it("appends a NEGATIVE delta when lowering reserve below currentR", async () => {
    const { adjustCategoryReserve } =
      await import("../../src/application/adjust-category-reserve");
    const cap: { ledgerDelta: bigint | null } = { ledgerDelta: null };

    // currentR = 1000c. Set target 250c → delta = −750c. No spill to siblings.
    const uc = adjustCategoryReserve(
      buildDeps({
        adjustmentsRepo: {
          create: async (i: any) => {
            cap.ledgerDelta = i.deltaCents;
            return { id: "adj-x", occurredAt: new Date() };
          },
        },
        categoriesRepo: mockCategoriesRepo({
          findById: async () => ({
            id: "B",
            name: "B",
            reserveExcluded: false,
            archivedAt: null,
            sortIndex: 2,
          }),
          list: [
            { id: "A", name: "A", reserveExcluded: false },
            { id: "B", name: "B", reserveExcluded: false },
          ],
        }),
        reservePositions: async () =>
          ok(fakePositions({ reservesByCat: { A: 50n, B: 1000n } })),
      }),
    );
    const r = await uc({ ...baseInput, categoryId: "B", expectedCents: 250 });
    expect(r.isOk()).toBe(true);
    expect(cap.ledgerDelta).toBe(-750n);
    if (r.isOk()) expect(r.value.deltaCents).toBe("-750");
  });

  it("NO-OP when target === currentR (no ledger row written)", async () => {
    const { adjustCategoryReserve } =
      await import("../../src/application/adjust-category-reserve");
    let createCalled = false;

    const uc = adjustCategoryReserve(
      buildDeps({
        adjustmentsRepo: {
          create: async () => {
            createCalled = true;
            return { id: "adj-x", occurredAt: new Date() };
          },
        },
        categoriesRepo: mockCategoriesRepo({
          findById: async () => ({
            id: "c1",
            name: "Food",
            reserveExcluded: false,
            archivedAt: null,
            sortIndex: 1,
          }),
          list: [{ id: "c1", name: "Food", reserveExcluded: false }],
        }),
        reservePositions: async () =>
          ok(fakePositions({ reservesByCat: { c1: 700n } })),
      }),
    );
    const r = await uc({ ...baseInput, expectedCents: 700 });
    expect(r.isOk()).toBe(true);
    expect(createCalled).toBe(false); // delta 0 → no append
    if (r.isOk()) {
      expect(r.value.deltaCents).toBe("0");
      expect(r.value.reserveCents).toBe("700");
    }
  });

  it("currentR defaults to 0 when the category has no prior reserve", async () => {
    const { adjustCategoryReserve } =
      await import("../../src/application/adjust-category-reserve");
    const cap: { ledgerDelta: bigint | null } = { ledgerDelta: null };
    const uc = adjustCategoryReserve(
      buildDeps({
        adjustmentsRepo: {
          create: async (i: any) => {
            cap.ledgerDelta = i.deltaCents;
            return { id: "adj-x", occurredAt: new Date() };
          },
        },
        categoriesRepo: mockCategoriesRepo({
          findById: async () => ({
            id: "c1",
            name: "Food",
            reserveExcluded: false,
            archivedAt: null,
            sortIndex: 1,
          }),
          list: [{ id: "c1", name: "Food", reserveExcluded: false }],
        }),
        // positions has no entry for c1 → currentR = 0.
        reservePositions: async () => ok(fakePositions({})),
      }),
    );
    const r = await uc({ ...baseInput, expectedCents: 300 });
    expect(r.isOk()).toBe(true);
    expect(cap.ledgerDelta).toBe(300n);
  });
});

// ===========================================================================
// toggleCategoryReserveExcluded — flag only, NO sibling refill (decision)
// ===========================================================================
describe("toggleCategoryReserveExcluded use case", () => {
  it("returns not_found when category is null (RLS cross-tenant)", async () => {
    const { toggleCategoryReserveExcluded } =
      await import("../../src/application/toggle-category-reserve-excluded");
    const uc = toggleCategoryReserveExcluded({
      repo: mockCategoriesRepo({}) as any,
    });
    const r = await uc({
      tenantId: "t1",
      budgetId: "t1",
      categoryId: "c1",
      excluded: true,
      actorUserId: "u1",
    });
    expect(r.isErr() && r.error.message).toBe("not_found");
  });

  it("on exclude: sets the flag only — NO sibling refill", async () => {
    const { toggleCategoryReserveExcluded } =
      await import("../../src/application/toggle-category-reserve-excluded");
    const capture: any = {};
    const uc = toggleCategoryReserveExcluded({
      repo: mockCategoriesRepo({
        findById: async () => ({
          id: "B",
          name: "B",
          reserveExcluded: false,
          archivedAt: null,
          sortIndex: 2,
        }),
        list: [
          { id: "A", name: "A", reserveExcluded: false },
          { id: "B", name: "B", reserveExcluded: false },
        ],
        capture,
      }) as any,
    });
    const r = await uc({
      tenantId: "t1",
      budgetId: "t1",
      categoryId: "B",
      excluded: true,
      actorUserId: "u1",
    });
    expect(r.isOk()).toBe(true);
    expect(capture.exclude).toBe(true);
    expect(capture.excludedValue).toBe(true);
    if (r.isOk()) expect(r.value.reserveExcluded).toBe(true);
  });

  it("on include (un-exclude): sets the flag back to false", async () => {
    const { toggleCategoryReserveExcluded } =
      await import("../../src/application/toggle-category-reserve-excluded");
    const capture: any = {};
    const uc = toggleCategoryReserveExcluded({
      repo: mockCategoriesRepo({
        findById: async () => ({
          id: "B",
          name: "B",
          reserveExcluded: true,
          archivedAt: null,
          sortIndex: 2,
        }),
        capture,
      }) as any,
    });
    const r = await uc({
      tenantId: "t1",
      budgetId: "t1",
      categoryId: "B",
      excluded: false,
      actorUserId: "u1",
    });
    expect(r.isOk()).toBe(true);
    expect(capture.exclude).toBe(true);
    expect(capture.excludedValue).toBe(false);
  });
});

// ===========================================================================
// getReservesSummary — engine-derived (reserve/used/overspent + surplus)
// ===========================================================================
describe("getReservesSummary use case", () => {
  it("returns disabled=true with empty rows when reserves_enabled=false", async () => {
    const { getReservesSummary } =
      await import("../../src/application/get-reserves-summary");
    const uc = getReservesSummary({
      reservePositions: async () => ok(fakePositions({})),
      categoriesRepo: mockCategoriesRepo({}) as any,
      budgetCurrencyOf: async () => "EUR",
      isReservesEnabled: async () => false,
    });
    const r = await uc({ tenantId: "b1", budgetId: "b1" });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.rows).toEqual([]);
      expect(r.value.totals.disabled).toBe(true);
      expect(r.value.totals.budgetCurrency).toBe("EUR");
    }
  });

  it("projects engine R/used/overspent per category + internal/userDefined/surplus", async () => {
    const { getReservesSummary } =
      await import("../../src/application/get-reserves-summary");
    const uc = getReservesSummary({
      reservePositions: async () =>
        ok(
          fakePositions({
            reservesByCat: { H: 200n, G: 2500n },
            usedByCat: { G: 300n },
            overspentByCat: { G: 100n },
            userDefinedCents: 1700n, // surplus = 1700 − 2700 = −1000 → TOPUP
          }),
        ),
      categoriesRepo: mockCategoriesRepo({
        list: [
          { id: "H", name: "Housing", reserveExcluded: false },
          { id: "G", name: "Groceries", reserveExcluded: false },
        ],
      }) as any,
      budgetCurrencyOf: async () => "EUR",
      isReservesEnabled: async () => true,
    });
    const r = await uc({ tenantId: "b1", budgetId: "b1" });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      const H = r.value.rows.find((x) => x.categoryId === "H")!;
      const G = r.value.rows.find((x) => x.categoryId === "G")!;
      expect(H.reserveCents).toBe("200");
      expect(G.reserveCents).toBe("2500");
      expect(G.usedCents).toBe("300");
      expect(G.overspentCents).toBe("100");
      expect(r.value.totals.internalCents).toBe("2700");
      expect(r.value.totals.userDefinedCents).toBe("1700");
      expect(r.value.totals.surplusCents).toBe("-1000");
      expect(r.value.totals.direction).toBe("TOPUP");
    }
  });

  it("excluded categories show a name-only row, not counted in internal", async () => {
    const { getReservesSummary } =
      await import("../../src/application/get-reserves-summary");
    const uc = getReservesSummary({
      reservePositions: async () =>
        // X excluded → not part of internal (only A's 300 counts).
        ok(
          fakePositions({
            reservesByCat: { A: 300n },
            userDefinedCents: 300n,
          }),
        ),
      categoriesRepo: mockCategoriesRepo({
        list: [
          { id: "A", name: "A", reserveExcluded: false },
          { id: "X", name: "Excl", reserveExcluded: true },
        ],
      }) as any,
      budgetCurrencyOf: async () => "EUR",
      isReservesEnabled: async () => true,
    });
    const r = await uc({ tenantId: "b1", budgetId: "b1" });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.rows.length).toBe(1);
      expect(r.value.excludedRows.length).toBe(1);
      expect(r.value.excludedRows[0].categoryId).toBe("X");
      expect(r.value.totals.internalCents).toBe("300");
    }
  });
});

// ===========================================================================
// archive-category — both modes; reserve leaves internal; no sibling spill (J)
// ===========================================================================
describe("archiveCategory use case — both modes, no sibling spill", () => {
  function makeCategoryRepoStub() {
    const calls: Array<{ opts: any }> = [];
    const repo = {
      findById: async (_t: string, id: string) => ({
        id,
        name: "Cat",
        parentId: null,
        createdAt: new Date(),
        isArchived: () => false,
      }),
      archive: async (_t: string, _id: string, _actor: string, opts: any) => {
        calls.push({ opts });
      },
    };
    return { repo, calls };
  }

  it("mode 'all' archives with hideAll:true", async () => {
    const { archiveCategory } =
      await import("../../src/application/archive-category");
    const { repo, calls } = makeCategoryRepoStub();
    const uc = archiveCategory({ repo: repo as any });
    const r = await uc({
      tenantId: "t1",
      categoryId: "c1",
      actorUserId: "u1",
      mode: "all",
    });
    expect(r.isOk()).toBe(true);
    expect(calls[0].opts.hideAll).toBe(true);
    if (r.isOk()) expect(r.value.archivedAt).not.toBeNull();
  });

  it("mode 'current_future' archives with archivedFrom = current month, hideAll:false", async () => {
    const { archiveCategory } =
      await import("../../src/application/archive-category");
    const { repo, calls } = makeCategoryRepoStub();
    const uc = archiveCategory({ repo: repo as any });
    const r = await uc({
      tenantId: "t1",
      categoryId: "c1",
      actorUserId: "u1",
      mode: "current_future",
    });
    expect(r.isOk()).toBe(true);
    expect(calls[0].opts.hideAll).toBe(false);
    expect(typeof calls[0].opts.archivedFrom).toBe("string"); // 'YYYY-MM-01'
    expect(calls[0].opts.archivedFrom).toMatch(/^\d{4}-\d{2}-01$/);
    if (r.isOk()) expect(r.value.archivedAt).toBeNull(); // history preserved
  });

  it("recomputes RESERVE_TOPUP when taskRepo + reservePositions are wired", async () => {
    const { archiveCategory } =
      await import("../../src/application/archive-category");
    const { repo } = makeCategoryRepoStub();
    let emitted = false;
    let resolved = false;
    const taskRepo = {
      emitReserveTopup: async () => {
        emitted = true;
      },
      resolveByKindAndBudget: async () => {
        resolved = true;
      },
    };
    const uc = archiveCategory({
      repo: repo as any,
      taskRepo: taskRepo as any,
      // After archiving, internal drops below userDefined → surplus > 0 → WITHDRAW.
      reservePositions: async () =>
        ok(
          fakePositions({ reservesByCat: { A: 100n }, userDefinedCents: 500n }),
        ),
      budgetCurrencyOf: async () => "EUR",
      isReservesEnabled: async () => true,
    } as any);
    const r = await uc({
      tenantId: "t1",
      categoryId: "c1",
      actorUserId: "u1",
      mode: "all",
    });
    expect(r.isOk()).toBe(true);
    expect(emitted).toBe(true);
    expect(resolved).toBe(false);
  });
});

// ===========================================================================
// archiveWallet — RESERVE archive drops userDefined; NO actual recalc
// ===========================================================================
describe("archiveWallet use case — no reserve allocation", () => {
  function makeWalletStub(walletType: "RESERVE" | "SPENDINGS") {
    return {
      id: "w1",
      walletType,
      archivedAt: null as Date | null,
      currentBalance: {
        amount: { times: () => ({ toFixed: () => "10000" }) },
      },
      archive() {
        (this as any).archivedAt = new Date();
        return { isErr: () => false } as any;
      },
    };
  }

  it("archiving a RESERVE wallet archives + recomputes RESERVE_TOPUP, no allocator", async () => {
    const { archiveWallet } =
      await import("../../src/application/archive-wallet");
    const wallet = makeWalletStub("RESERVE");
    let archived = false;
    let emitted = false;
    const repo = {
      ...noopRepoMethods,
      findById: async () => wallet,
      archive: async () => {
        archived = true;
      },
    } as any;
    const uc = archiveWallet({
      repo,
      taskRepo: {
        emitReserveTopup: async () => {
          emitted = true;
        },
        resolveByKindAndBudget: async () => {},
      } as any,
      // userDefined drops to 0 (last reserve wallet) → surplus = 0 − 5000 = −5000 → TOPUP.
      reservePositions: async () =>
        ok(
          fakePositions({ reservesByCat: { A: 5000n }, userDefinedCents: 0n }),
        ),
      budgetCurrencyOf: async () => "EUR",
      isReservesEnabled: async () => true,
    } as any);
    const r = await uc({ tenantId: "t1", walletId: "w1", actorUserId: "u1" });
    expect(r.isOk()).toBe(true);
    expect(archived).toBe(true);
    expect(emitted).toBe(true);
  });

  it("archiving a SPENDINGS wallet does NOT recompute reserve", async () => {
    const { archiveWallet } =
      await import("../../src/application/archive-wallet");
    const wallet = makeWalletStub("SPENDINGS");
    let emitted = false;
    const repo = {
      ...noopRepoMethods,
      findById: async () => wallet,
      archive: async () => {},
    } as any;
    const uc = archiveWallet({
      repo,
      taskRepo: {
        emitReserveTopup: async () => {
          emitted = true;
        },
        resolveByKindAndBudget: async () => {},
      } as any,
      reservePositions: async () => ok(fakePositions({})),
      budgetCurrencyOf: async () => "EUR",
      isReservesEnabled: async () => true,
    } as any);
    const r = await uc({ tenantId: "t1", walletId: "w1", actorUserId: "u1" });
    expect(r.isOk()).toBe(true);
    expect(emitted).toBe(false);
  });
});
