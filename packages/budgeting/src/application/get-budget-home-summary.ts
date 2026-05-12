/**
 * get-budget-home-summary.ts — HOME-02 application service.
 *
 * Powers `GET /budgets/:id/home-summary`. Returns the locked DTO shape from
 * 03-02-PLAN.md <interfaces>: per-budget current-month spend, FX-converted
 * wallets total, and top-2 overspent categories.
 *
 * Hex layering: zero drizzle-orm + zero hono imports (ENGR-02). The service
 * orchestrates ports only:
 *   - BudgetHomeSummaryRepo      — tenant-scoped reads (uses withTenantTx)
 *   - FxProvider                 — daily-rate FX (Phase 2's rateAsOf shape)
 *   - UserDisplayCurrencyReader  — thin local port over identity.UserRepo
 *
 * D-PH3-12: wallets sum is FX-converted SERVER-SIDE to the user's
 * display_currency. Display currency falls back to budget.default_currency
 * when the user has no display_currency set.
 */
import { ok, err, type Result } from "@budget/shared-kernel";
import { Money } from "@budget/shared-kernel";
import type { Currency } from "@budget/shared-kernel";
import type { FxProvider } from "@budget/shared-kernel";
import type {
  BudgetHomeSummaryRepo,
  BudgetKind,
} from "../ports/budget-home-summary-repo";
import type { UserDisplayCurrencyReader } from "../ports/user-display-currency-reader";

export interface GetBudgetHomeSummaryInput {
  /** Per v1.1 invariant, also equals the tenantId. */
  budgetId: string;
  userId: string;
  /** Caller-controlled clock; the service computes UTC month boundaries. */
  now: Date;
}

export interface HomeSummaryAmount {
  amount_cents: string;
  currency: string;
}

export interface WalletsValueDto {
  amount_cents: string;
  currency: string;
  converted_at: string;
}

export interface TopOverspentDto {
  category_id: string;
  category_name: string;
  over_amount_cents: string;
}

export interface HomeSummaryDTO {
  budgetId: string;
  name: string;
  kind: BudgetKind;
  default_currency: string;
  display_currency: string;
  spent_current_month: HomeSummaryAmount;
  wallets_value_display_ccy: WalletsValueDto;
  top_overspent: TopOverspentDto[];
}

export interface GetBudgetHomeSummaryDeps {
  summaryRepo: BudgetHomeSummaryRepo;
  fxProvider: FxProvider;
  displayCurrencyReader: UserDisplayCurrencyReader;
}

/** True iff the candidate looks like a valid ISO-4217 alpha-3 code. */
function isValidCurrency(c: string | null | undefined): c is string {
  return typeof c === "string" && c.trim().length === 3;
}

/** Convert bigint cents → Money via decimal string (avoids float loss). */
function centsToMoney(amountCents: bigint, currency: string): Money {
  const negative = amountCents < 0n;
  const abs = negative ? -amountCents : amountCents;
  const whole = abs / 100n;
  const fraction = abs % 100n;
  const dec = `${negative ? "-" : ""}${whole}.${String(fraction).padStart(2, "0")}`;
  return Money.of(dec, currency as Currency);
}

/** Round a Money decimal back to integer cents (banker's rounding via Big). */
function moneyToCents(m: Money): bigint {
  // amount is Big with up to FIAT_SCALE (4) decimals. Multiply by 100 and take
  // integer part using toFixed(0) — Big.RM = ROUND_HALF_EVEN is set globally.
  const centsStr = m.amount.times(100).toFixed(0);
  return BigInt(centsStr);
}

export function getBudgetHomeSummary(deps: GetBudgetHomeSummaryDeps) {
  return async (
    input: GetBudgetHomeSummaryInput,
  ): Promise<Result<HomeSummaryDTO, Error>> => {
    try {
      const meta = await deps.summaryRepo.getBudgetMeta(input.budgetId);
      if (!meta) return err(new Error("budget_not_found"));

      // Identity is cross-tenant. The reader port internally uses
      // withUserContext (NOT withTenantTx) — that's adapted in apps/api/boot.ts
      // from deps.identity.userRepo.findById.
      const userDisplay = await deps.displayCurrencyReader.getDisplayCurrency(
        input.userId,
      );
      const displayCurrency = isValidCurrency(userDisplay)
        ? userDisplay
        : meta.default_currency;

      // UTC month boundaries [start, end) — Date.UTC normalizes DST/TZ.
      const monthStart = new Date(
        Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth(), 1),
      );
      const monthEnd = new Date(
        Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth() + 1, 1),
      );

      // Parallelize the 3 sub-queries — they share no data dependency.
      const [spentCents, wallets, overspent] = await Promise.all([
        deps.summaryRepo.sumCurrentMonthSpend(
          input.budgetId,
          monthStart,
          monthEnd,
        ),
        deps.summaryRepo.listWalletsForBudget(input.budgetId),
        deps.summaryRepo.topOverspentCategories(
          input.budgetId,
          monthStart,
          monthEnd,
          meta.cushion_mode_enabled,
          2,
        ),
      ]);

      // Convert each wallet to display_currency via FxProvider.rateAsOf
      // (Phase 2 port shape). Sum in display_currency.
      const convertedAt = new Date();
      let walletsSumCents = 0n;
      for (const w of wallets) {
        if (w.currency === displayCurrency) {
          walletsSumCents += w.amount_cents;
          continue;
        }
        const { rate } = await deps.fxProvider.rateAsOf(
          w.currency as Currency,
          displayCurrency as Currency,
          convertedAt,
        );
        // Convert via Money to preserve precision (cents → decimal → × rate → cents).
        const sourceMoney = centsToMoney(w.amount_cents, w.currency);
        const converted = sourceMoney.mul(rate);
        // Re-tag currency: mul() preserves source currency; we need target.
        const targetMoney = Money.of(
          converted.amount.toFixed(),
          displayCurrency as Currency,
        );
        walletsSumCents += moneyToCents(targetMoney);
      }

      return ok({
        budgetId: input.budgetId,
        name: meta.name,
        kind: meta.kind,
        default_currency: meta.default_currency,
        display_currency: displayCurrency,
        spent_current_month: {
          amount_cents: spentCents.toString(),
          currency: meta.default_currency,
        },
        wallets_value_display_ccy: {
          amount_cents: walletsSumCents.toString(),
          currency: displayCurrency,
          converted_at: convertedAt.toISOString(),
        },
        top_overspent: overspent.map((o) => ({
          category_id: o.category_id,
          category_name: o.category_name,
          over_amount_cents: o.over_amount_cents.toString(),
        })),
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}
