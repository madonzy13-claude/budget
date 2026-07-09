/**
 * compute-budget-wealth-now.ts — shared "wealth right now" primitive (11-03).
 *
 * Authored ONCE; reused by:
 *   - get-overview-cards.ts        (the capitalization + investment cards, 11-03)
 *   - get-overview-wealth.ts       (the live current point appended to the series, 11-06)
 *   - budget-wealth-snapshot-3h.ts (the 3h cron snapshots this exact output, 11-07)
 *
 * Output (bigint cents, in the budget default_currency — D-07/D-11):
 *   - investment_value_cents = Σ holdings value, already FX→default_ccy, non-archived
 *   - capitalization_cents   = Σ ALL wallet balances (FX→default_ccy) + investment value
 *
 * Hex layering: ports only (no drizzle/hono). FX via FxProvider.rateAsOf with the
 * distinct-pair batching pattern from get-budget-home-summary.ts. bigint throughout.
 */
import { Money } from "@budget/shared-kernel";
import type { Currency, FxProvider } from "@budget/shared-kernel";

export interface WalletWithType {
  amount_cents: bigint;
  currency: string;
  wallet_type: "SPENDINGS" | "CUSHION" | "RESERVE";
}

/** Tenant-scoped wallet reader (the adapter opens its own withTenantTxRead). */
export interface OverviewWalletReader {
  listWalletsWithType(budgetId: string): Promise<WalletWithType[]>;
}

/** Investments valuation port — returns Σ non-archived holding value already
 *  converted to the budget default_currency (reuses listHoldings.valueInBudgetCents). */
export interface HoldingsValuationPort {
  investmentValueCents(input: {
    tenantId: string;
    budgetId: string;
    defaultCurrency: string;
  }): Promise<bigint>;
}

export interface ComputeBudgetWealthNowDeps {
  walletRepo: OverviewWalletReader;
  holdingsValuation: HoldingsValuationPort;
  fxProvider: FxProvider;
}

export interface ComputeBudgetWealthNowInput {
  budgetId: string;
  tenantId: string;
  defaultCurrency: string;
  now: Date;
}

export interface BudgetWealthNow {
  capitalization_cents: bigint;
  investment_value_cents: bigint;
  currency: string;
}

/** bigint cents → Money via decimal string (no float loss). Mirrors get-budget-home-summary. */
function centsToMoney(amountCents: bigint, currency: string): Money {
  const negative = amountCents < 0n;
  const abs = negative ? -amountCents : amountCents;
  const whole = abs / 100n;
  const fraction = abs % 100n;
  const dec = `${negative ? "-" : ""}${whole}.${String(fraction).padStart(2, "0")}`;
  return Money.of(dec, currency as Currency);
}

/** Money decimal → integer cents (banker's rounding via Big global RM). */
function moneyToCents(m: Money): bigint {
  return BigInt(m.amount.times(100).toFixed(0));
}

/**
 * Sum a list of {amount_cents, currency} into `target` currency (bigint cents).
 * Batches DISTINCT (from→target) pairs through FxProvider.rateAsOf in parallel,
 * then sums synchronously. Shared by computeBudgetWealthNow + get-overview-cards.
 */
export async function sumWalletsToCurrency(
  items: { amount_cents: bigint; currency: string }[],
  target: string,
  fxProvider: FxProvider,
  asOf: Date,
): Promise<bigint> {
  const distinctPairs = new Set<string>();
  for (const it of items) {
    if (it.currency !== target) distinctPairs.add(`${it.currency}->${target}`);
  }
  const rateEntries = await Promise.all(
    Array.from(distinctPairs).map(async (pair) => {
      const [from] = pair.split("->") as [string, string];
      const { rate } = await fxProvider.rateAsOf(
        from as Currency,
        target as Currency,
        asOf,
      );
      return [pair, rate] as [string, string];
    }),
  );
  const rateMap = new Map(rateEntries);

  let sumCents = 0n;
  for (const it of items) {
    if (it.currency === target) {
      sumCents += it.amount_cents;
      continue;
    }
    const rate = rateMap.get(`${it.currency}->${target}`)!;
    const converted = centsToMoney(it.amount_cents, it.currency).mul(rate);
    sumCents += moneyToCents(
      Money.of(converted.amount.toFixed(), target as Currency),
    );
  }
  return sumCents;
}

export function computeBudgetWealthNow(deps: ComputeBudgetWealthNowDeps) {
  return async (
    input: ComputeBudgetWealthNowInput,
  ): Promise<BudgetWealthNow> => {
    const [wallets, investmentValueCents] = await Promise.all([
      deps.walletRepo.listWalletsWithType(input.budgetId),
      deps.holdingsValuation.investmentValueCents({
        tenantId: input.tenantId,
        budgetId: input.budgetId,
        defaultCurrency: input.defaultCurrency,
      }),
    ]);

    const walletsCents = await sumWalletsToCurrency(
      wallets,
      input.defaultCurrency,
      deps.fxProvider,
      input.now,
    );

    return {
      capitalization_cents: walletsCents + investmentValueCents,
      investment_value_cents: investmentValueCents,
      currency: input.defaultCurrency,
    };
  };
}
