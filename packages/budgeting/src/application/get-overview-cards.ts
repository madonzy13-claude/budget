/**
 * get-overview-cards.ts — the 5-card Overview summary (11-03).
 *
 * All amounts in budget default_currency (D-11) — Overview intentionally differs
 * from home-summary, which converts to the user's chosen display currency. bigint
 * through the service; the route stringifies at the boundary.
 *
 * Cards:
 *   - available_to_spend = Σ SPENDINGS wallets (D-09)
 *   - available_reserves = Σ RESERVE wallets (D-09)
 *   - capitalization     = Σ ALL wallets + investment value (D-07) via computeBudgetWealthNow
 *   - cushion            = real_months + total from get-cushion-summary (no new math, D-08)
 *   - overspent          = after-reserves top-N + count, archived EXCLUDED (D-06/D-10),
 *                          sourced from the spendings grid (get-spendings-summary)
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import type { FxProvider } from "@budget/shared-kernel";
import {
  computeBudgetWealthNow,
  sumWalletsToCurrency,
  type OverviewWalletReader,
  type HoldingsValuationPort,
} from "./compute-budget-wealth-now";

/** Subset of get-cushion-summary's DTO this service consumes (cents as strings). */
interface CushionSummaryLike {
  required_cents: string;
  actual_cents: string;
  currency: string;
  enabled: boolean;
  target_months: number;
}

/** Subset of get-reserves-summary's DTO this service consumes. */
interface ReservesSummaryLike {
  totals: {
    /** Σ R — engine-required reserve across active categories. */
    internalCents: string;
    /** Σ RESERVE-wallet balances (what the family actually holds). */
    userDefinedCents: string;
    /** TOPUP = short, WITHDRAW = surplus, NONE = exactly covered. */
    direction: "TOPUP" | "WITHDRAW" | "NONE";
    disabled: boolean;
  };
}

/** Subset of get-spendings-summary's DTO this service consumes. */
interface SpendingsCategoryLike {
  categoryId: string;
  name: string;
  archived: boolean;
  overspentCents: string;
  /** Spent this month (item 1). */
  spentCents: string;
  /** Active monthly budget / limit — the "available" denominator (item 1). */
  activeBudgetCents: string;
  /** Normal planned amount (NOT cushion) — retirement-runway burn rate (item 5). */
  plannedCents: string;
}
interface SpendingsSummaryLike {
  budgetCurrency: string;
  categories: SpendingsCategoryLike[];
}

export interface OverviewMetaReader {
  getBudgetMeta(
    budgetId: string,
  ): Promise<{
    default_currency: string;
    cushion_mode_enabled: boolean;
  } | null>;
}

export interface GetOverviewCardsDeps {
  metaReader: OverviewMetaReader;
  walletRepo: OverviewWalletReader;
  holdingsValuation: HoldingsValuationPort;
  fxProvider: FxProvider;
  cushionSummary: (input: {
    tenantId: string;
    budgetId: string;
  }) => Promise<Result<CushionSummaryLike, Error>>;
  reservesSummary: (input: {
    tenantId: string;
    budgetId: string;
  }) => Promise<Result<ReservesSummaryLike, Error>>;
  spendingsSummary: (input: {
    tenantId: string;
    budgetId: string;
    month: string;
  }) => Promise<Result<SpendingsSummaryLike, Error>>;
  /** Clock; defaults to new Date(). */
  now?: () => Date;
}

export interface OverviewOverspentTop {
  category_id: string;
  name: string;
  over_amount_cents: bigint;
}

export interface OverviewCards {
  default_currency: string;
  available_to_spend_cents: bigint;
  /** Available-to-spend breakdown (item 1): spent this month, budget left, wallet
   * cash, and whether the wallets cover what's left to spend. */
  spendings: {
    spent_cents: bigint;
    left_cents: bigint;
    wallet_cents: bigint;
    good: boolean;
  };
  capitalization_cents: bigint;
  investment_value_cents: bigint;
  /** How many months the capitalization lasts at the normal monthly planned spend
   * — "how long could I survive if I retire now" (item 5). null = no planned spend
   * (would last forever). */
  retirement_months: number | null;
  /** Annual inflation % baked into the retirement simulation (item 8). */
  retirement_inflation_pct: number;
  available_reserves_cents: bigint;
  /** Reserves health (item 3): required (engine internal) vs wallet holdings.
   * ok = exactly covered, short = under, surplus = over. */
  reserves: {
    required_cents: bigint;
    wallet_cents: bigint;
    status: "ok" | "short" | "surplus";
  };
  cushion: {
    enabled: boolean;
    real_months: number;
    total_cents: bigint;
    /** Required cushion to cover the threshold — for the "have vs needed" line. */
    required_cents: bigint;
    /** actual ≥ required — cushion fully covers its required limit (D-08). */
    covered: boolean;
  };
  overspent: {
    count: number;
    currency: string;
    /** Σ overspend across ALL overspent categories (item 5). */
    total_cents: bigint;
    top: OverviewOverspentTop[];
  };
}

export interface GetOverviewCardsInput {
  tenantId: string;
  budgetId: string;
}

/** How many overspent categories to surface in the card. */
const OVERSPENT_TOP_N = 3;

/** Annual inflation applied to the retirement-runway drawdown simulation (item 8). */
const RETIREMENT_INFLATION_PCT = 4.5;

export function getOverviewCards(deps: GetOverviewCardsDeps) {
  const wealthNow = computeBudgetWealthNow({
    walletRepo: deps.walletRepo,
    holdingsValuation: deps.holdingsValuation,
    fxProvider: deps.fxProvider,
  });

  return async (
    input: GetOverviewCardsInput,
  ): Promise<Result<OverviewCards, Error>> => {
    try {
      const now = deps.now ? deps.now() : new Date();
      const meta = await deps.metaReader.getBudgetMeta(input.budgetId);
      if (!meta) return err(new Error("budget_not_found"));
      const defaultCcy = meta.default_currency;
      const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

      const [wealth, wallets, cushionRes, spendingsRes, reservesRes] =
        await Promise.all([
          wealthNow({
            budgetId: input.budgetId,
            tenantId: input.tenantId,
            defaultCurrency: defaultCcy,
            now,
          }),
          deps.walletRepo.listWalletsWithType(input.budgetId),
          deps.cushionSummary({
            tenantId: input.tenantId,
            budgetId: input.budgetId,
          }),
          deps.spendingsSummary({
            tenantId: input.tenantId,
            budgetId: input.budgetId,
            month,
          }),
          deps.reservesSummary({
            tenantId: input.tenantId,
            budgetId: input.budgetId,
          }),
        ]);

      if (cushionRes.isErr()) return err(cushionRes.error);
      if (spendingsRes.isErr()) return err(spendingsRes.error);
      if (reservesRes.isErr()) return err(reservesRes.error);
      const cushion = cushionRes.value;
      const spendings = spendingsRes.value;
      const reserves = reservesRes.value;

      // SPENDINGS / RESERVE partial sums (FX→default_ccy).
      const [availableToSpend, availableReserves] = await Promise.all([
        sumWalletsToCurrency(
          wallets.filter((w) => w.wallet_type === "SPENDINGS"),
          defaultCcy,
          deps.fxProvider,
          now,
        ),
        sumWalletsToCurrency(
          wallets.filter((w) => w.wallet_type === "RESERVE"),
          defaultCcy,
          deps.fxProvider,
          now,
        ),
      ]);

      // Cushion: real_months = actual / (required / target_months). No new math.
      const requiredCents = BigInt(cushion.required_cents);
      const actualCents = BigInt(cushion.actual_cents);
      const realMonths =
        cushion.target_months <= 0 || requiredCents === 0n
          ? 0
          : Number(actualCents) /
            (Number(requiredCents) / cushion.target_months);

      // Available-to-spend breakdown (item 1). Spent this month + budget left
      // (Σ active limit − Σ spent, clamped ≥0) over non-archived categories;
      // wallet cash = availableToSpend. "good" = wallets cover what's left.
      let spentThisMonth = 0n;
      let activeBudget = 0n;
      let monthlyPlanned = 0n;
      for (const c of spendings.categories) {
        if (c.archived) continue;
        spentThisMonth += BigInt(c.spentCents);
        activeBudget += BigInt(c.activeBudgetCents);
        monthlyPlanned += BigInt(c.plannedCents);
      }
      const leftToSpend =
        activeBudget - spentThisMonth > 0n ? activeBudget - spentThisMonth : 0n;

      // Retirement runway: how many months the capitalization lasts at the normal
      // monthly planned spend, with spending GROWING at RETIREMENT_INFLATION_PCT/yr
      // (item 8). Closed-form for a geometric (inflating) drawdown:
      //   N = ln(1 + W·r/s) / ln(1+r),  r = monthly inflation, W = wealth, s = spend.
      // No planned spend → lasts forever (null).
      const retirementMonths = (() => {
        if (monthlyPlanned <= 0n) return null;
        const W = Number(wealth.capitalization_cents);
        const s = Number(monthlyPlanned);
        const r = Math.pow(1 + RETIREMENT_INFLATION_PCT / 100, 1 / 12) - 1;
        return Math.log(1 + (W * r) / s) / Math.log(1 + r);
      })();

      // Reserves health (item 3) — engine internal (required) vs wallet holdings.
      const reservesRequired = BigInt(reserves.totals.internalCents);
      const reservesStatus: "ok" | "short" | "surplus" = reserves.totals
        .disabled
        ? "ok"
        : reserves.totals.direction === "TOPUP"
          ? "short"
          : reserves.totals.direction === "WITHDRAW"
            ? "surplus"
            : "ok";

      // Overspent: after-reserves overspent from the spendings grid, archived
      // categories excluded (D-06), top-N + total count.
      const overspentCats = spendings.categories
        .filter((c) => !c.archived && BigInt(c.overspentCents) > 0n)
        .sort((a, b) =>
          BigInt(b.overspentCents) > BigInt(a.overspentCents)
            ? 1
            : BigInt(b.overspentCents) < BigInt(a.overspentCents)
              ? -1
              : 0,
        );
      const overspentTotal = overspentCats.reduce(
        (sum, c) => sum + BigInt(c.overspentCents),
        0n,
      );

      return ok({
        default_currency: defaultCcy,
        available_to_spend_cents: availableToSpend,
        spendings: {
          spent_cents: spentThisMonth,
          left_cents: leftToSpend,
          wallet_cents: availableToSpend,
          good: availableToSpend >= leftToSpend,
        },
        capitalization_cents: wealth.capitalization_cents,
        investment_value_cents: wealth.investment_value_cents,
        retirement_months: retirementMonths,
        retirement_inflation_pct: RETIREMENT_INFLATION_PCT,
        available_reserves_cents: availableReserves,
        reserves: {
          required_cents: reservesRequired,
          wallet_cents: availableReserves,
          status: reservesStatus,
        },
        cushion: {
          enabled: cushion.enabled,
          real_months: realMonths,
          total_cents: actualCents,
          required_cents: requiredCents,
          // Covered = saved cushion meets the required limit. requiredCents===0n
          // (no requirement) reads as covered.
          covered: actualCents >= requiredCents,
        },
        overspent: {
          count: overspentCats.length,
          currency: spendings.budgetCurrency,
          total_cents: overspentTotal,
          top: overspentCats.slice(0, OVERSPENT_TOP_N).map((c) => ({
            category_id: c.categoryId,
            name: c.name,
            over_amount_cents: BigInt(c.overspentCents),
          })),
        },
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}
