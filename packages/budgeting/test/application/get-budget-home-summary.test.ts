/**
 * get-budget-home-summary.test.ts — Unit tests for HOME-02 application service.
 *
 * RED → GREEN → REFACTOR per CLAUDE.md TDD-first rule.
 *
 * Uses mocked BudgetHomeSummaryRepo + mocked FxProvider + mocked
 * UserDisplayCurrencyReader (a thin port over identity.UserRepo.findById,
 * defined locally in the budgeting application layer to avoid a hex-boundary
 * dependency from budgeting → identity).
 *
 * Covers the 7 cases listed in 03-02-PLAN.md <task 1> <behavior>:
 *   1. Zero wallets → wallets_value_display_ccy.amount_cents === "0".
 *   2. Mixed-currency wallets (USD/EUR) → summed in PLN via FxProvider.
 *   3. Zero overspent categories → top_overspent === [].
 *   4. 5 overspent categories → repo returns top-2 sorted DESC; service passes through.
 *   5. budget.cushion_mode_enabled === true → topOverspentCategories called with useCushion=true.
 *   6. getBudgetMeta returns null → service returns Err("budget_not_found").
 *   7. userRepo returns null OR display_currency === "" → falls back to default_currency.
 */
import { describe, it, expect } from "bun:test";
import { getBudgetHomeSummary } from "../../src/application/get-budget-home-summary";
import type { BudgetHomeSummaryRepo } from "../../src/ports/budget-home-summary-repo";
import type { FxProvider } from "@budget/shared-kernel";
import { Money } from "@budget/shared-kernel";
import type { UserDisplayCurrencyReader } from "../../src/ports/user-display-currency-reader";

function makeRepo(
  overrides: Partial<BudgetHomeSummaryRepo> = {},
): BudgetHomeSummaryRepo {
  return {
    getBudgetMeta: async () => ({
      name: "Test",
      kind: "PRIVATE" as const,
      default_currency: "USD",
      cushion_mode_enabled: false,
    }),
    sumCurrentMonthSpend: async () => 0n,
    listWalletsForBudget: async () => [],
    topOverspentCategories: async () => [],
    ...overrides,
  };
}

function makeDisplayReader(
  displayCurrency: string | null,
): UserDisplayCurrencyReader {
  return {
    getDisplayCurrency: async () => displayCurrency,
  };
}

/**
 * FxProvider.rateAsOf — Phase 2 port shape (verified in
 * packages/shared-kernel/src/ports/fx-provider.ts). Returns
 * {rate: string, provider, isStale}. The application multiplies
 * Money.amount × rate to obtain the converted Money in target currency.
 */
function makeFx(rates: Record<string, number> = {}): FxProvider {
  return {
    rateAsOf: async (from, to) => {
      if (from === to)
        return { rate: "1", provider: "in-memory", isStale: false };
      const r = rates[`${from}->${to}`] ?? 1;
      return { rate: String(r), provider: "in-memory", isStale: false };
    },
  };
}

const BUDGET_ID = "11111111-1111-1111-1111-111111111111";
const USER_ID = "22222222-2222-2222-2222-222222222222";
const NOW = new Date("2026-05-15T12:00:00Z");

describe("getBudgetHomeSummary", () => {
  it("Test 1: returns wallets_value_display_ccy.amount_cents === '0' when no wallets", async () => {
    const svc = getBudgetHomeSummary({
      summaryRepo: makeRepo(),
      fxProvider: makeFx(),
      displayCurrencyReader: makeDisplayReader("PLN"),
    });
    const r = await svc({ budgetId: BUDGET_ID, userId: USER_ID, now: NOW });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.wallets_value_display_ccy.amount_cents).toBe("0");
      expect(r.value.wallets_value_display_ccy.currency).toBe("PLN");
    }
  });

  it("Test 2: FX-sums mixed-currency wallets in display_currency (PLN)", async () => {
    // 100.00 USD → 400 PLN  (rate 4.00)
    // 200.00 EUR → 880 PLN  (rate 4.40)
    // total = 1280 PLN = 128000 cents (FIAT_SCALE=4 → amount.times(10000) is the
    // adapter-level cents representation; we keep adapter contract: amount_cents
    // is the integer cent count as a string)
    const svc = getBudgetHomeSummary({
      summaryRepo: makeRepo({
        listWalletsForBudget: async () => [
          // wallets here are pre-converted to (cents bigint, currency) at the
          // adapter boundary, per BudgetHomeSummaryRepo.listWalletsForBudget contract.
          { amount_cents: 10000n, currency: "USD" }, // $100.00
          { amount_cents: 20000n, currency: "EUR" }, // €200.00
        ],
      }),
      fxProvider: makeFx({ "USD->PLN": 4.0, "EUR->PLN": 4.4 }),
      displayCurrencyReader: makeDisplayReader("PLN"),
    });
    const r = await svc({ budgetId: BUDGET_ID, userId: USER_ID, now: NOW });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.wallets_value_display_ccy.amount_cents).toBe("128000");
      expect(r.value.wallets_value_display_ccy.currency).toBe("PLN");
    }
  });

  it("Test 3: returns top_overspent === [] when none overspent", async () => {
    const svc = getBudgetHomeSummary({
      summaryRepo: makeRepo({ topOverspentCategories: async () => [] }),
      fxProvider: makeFx(),
      displayCurrencyReader: makeDisplayReader("USD"),
    });
    const r = await svc({ budgetId: BUDGET_ID, userId: USER_ID, now: NOW });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) expect(r.value.top_overspent).toEqual([]);
  });

  it("Test 4: passes through repo's top-2 result (repo handles LIMIT 2 + DESC sort)", async () => {
    // Service trusts the repo's contract: repo returns AT MOST `limit` rows,
    // already sorted DESC by over_amount_cents. We assert pass-through.
    const repoRows = [
      {
        category_id: "c1",
        category_name: "Groceries",
        over_amount_cents: 50000n,
      },
      { category_id: "c2", category_name: "Dining", over_amount_cents: 30000n },
    ];
    let capturedLimit = -1;
    const svc = getBudgetHomeSummary({
      summaryRepo: makeRepo({
        topOverspentCategories: async (_b, _s, _e, _c, limit) => {
          capturedLimit = limit;
          return repoRows;
        },
      }),
      fxProvider: makeFx(),
      displayCurrencyReader: makeDisplayReader("USD"),
    });
    const r = await svc({ budgetId: BUDGET_ID, userId: USER_ID, now: NOW });
    expect(r.isOk()).toBe(true);
    expect(capturedLimit).toBe(2);
    if (r.isOk()) {
      expect(r.value.top_overspent.length).toBe(2);
      expect(r.value.top_overspent[0]).toEqual({
        category_id: "c1",
        category_name: "Groceries",
        over_amount_cents: "50000",
      });
      expect(
        Number(r.value.top_overspent[0]!.over_amount_cents),
      ).toBeGreaterThan(Number(r.value.top_overspent[1]!.over_amount_cents));
    }
  });

  it("Test 5: passes useCushion=true when budget.cushion_mode_enabled is true", async () => {
    let capturedUseCushion: boolean | null = null;
    const svc = getBudgetHomeSummary({
      summaryRepo: makeRepo({
        getBudgetMeta: async () => ({
          name: "T",
          kind: "PRIVATE" as const,
          default_currency: "USD",
          cushion_mode_enabled: true,
        }),
        topOverspentCategories: async (_b, _s, _e, useCushion) => {
          capturedUseCushion = useCushion;
          return [];
        },
      }),
      fxProvider: makeFx(),
      displayCurrencyReader: makeDisplayReader("USD"),
    });
    const r = await svc({ budgetId: BUDGET_ID, userId: USER_ID, now: NOW });
    expect(r.isOk()).toBe(true);
    expect(capturedUseCushion).toBe(true);
  });

  it("Test 6: returns Err('budget_not_found') when getBudgetMeta returns null", async () => {
    const svc = getBudgetHomeSummary({
      summaryRepo: makeRepo({ getBudgetMeta: async () => null }),
      fxProvider: makeFx(),
      displayCurrencyReader: makeDisplayReader("PLN"),
    });
    const r = await svc({ budgetId: BUDGET_ID, userId: USER_ID, now: NOW });
    expect(r.isErr()).toBe(true);
    if (r.isErr()) expect(r.error.message).toBe("budget_not_found");
  });

  it("Test 7a: falls back to default_currency when displayCurrencyReader returns null", async () => {
    const svc = getBudgetHomeSummary({
      summaryRepo: makeRepo({
        getBudgetMeta: async () => ({
          name: "T",
          kind: "PRIVATE" as const,
          default_currency: "EUR",
          cushion_mode_enabled: false,
        }),
      }),
      fxProvider: makeFx(),
      displayCurrencyReader: makeDisplayReader(null),
    });
    const r = await svc({ budgetId: BUDGET_ID, userId: USER_ID, now: NOW });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) {
      expect(r.value.display_currency).toBe("EUR");
      expect(r.value.wallets_value_display_ccy.currency).toBe("EUR");
    }
  });

  it("Test 7b: falls back to default_currency when display_currency is empty string", async () => {
    const svc = getBudgetHomeSummary({
      summaryRepo: makeRepo({
        getBudgetMeta: async () => ({
          name: "T",
          kind: "PRIVATE" as const,
          default_currency: "EUR",
          cushion_mode_enabled: false,
        }),
      }),
      fxProvider: makeFx(),
      displayCurrencyReader: makeDisplayReader(""),
    });
    const r = await svc({ budgetId: BUDGET_ID, userId: USER_ID, now: NOW });
    expect(r.isOk()).toBe(true);
    if (r.isOk()) expect(r.value.display_currency).toBe("EUR");
  });

  // Sanity: confirm Money helper is still usable (compile-time guard against
  // removing the shared-kernel import).
  it("Money helper sanity check (compile-time guard)", () => {
    const m = Money.of("100.00", "USD");
    expect(m.toDb().currency).toBe("USD");
  });
});
