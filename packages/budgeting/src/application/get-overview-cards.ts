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

/** Subset of get-spendings-summary's DTO this service consumes. */
interface SpendingsCategoryLike {
  categoryId: string;
  name: string;
  archived: boolean;
  overspentCents: string;
}
interface SpendingsSummaryLike {
  budgetCurrency: string;
  categories: SpendingsCategoryLike[];
}

export interface OverviewMetaReader {
  getBudgetMeta(
    budgetId: string,
  ): Promise<{ default_currency: string; cushion_mode_enabled: boolean } | null>;
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
  capitalization_cents: bigint;
  investment_value_cents: bigint;
  available_reserves_cents: bigint;
  cushion: { enabled: boolean; real_months: number; total_cents: bigint };
  overspent: {
    count: number;
    currency: string;
    top: OverviewOverspentTop[];
  };
}

export interface GetOverviewCardsInput {
  tenantId: string;
  budgetId: string;
}

/** How many overspent categories to surface in the card. */
const OVERSPENT_TOP_N = 3;

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

      const [wealth, wallets, cushionRes, spendingsRes] = await Promise.all([
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
      ]);

      if (cushionRes.isErr()) return err(cushionRes.error);
      if (spendingsRes.isErr()) return err(spendingsRes.error);
      const cushion = cushionRes.value;
      const spendings = spendingsRes.value;

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
          : Number(actualCents) / (Number(requiredCents) / cushion.target_months);

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

      return ok({
        default_currency: defaultCcy,
        available_to_spend_cents: availableToSpend,
        capitalization_cents: wealth.capitalization_cents,
        investment_value_cents: wealth.investment_value_cents,
        available_reserves_cents: availableReserves,
        cushion: {
          enabled: cushion.enabled,
          real_months: realMonths,
          total_cents: actualCents,
        },
        overspent: {
          count: overspentCats.length,
          currency: spendings.budgetCurrency,
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
