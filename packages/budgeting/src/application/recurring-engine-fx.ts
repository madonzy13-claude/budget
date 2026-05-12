/**
 * recurring-engine-fx.ts — FX computation helper for the recurring draft engine.
 *
 * Encapsulates the cross-currency branch + rate-bounds check used by both the
 * worker handler (`apps/worker/src/handlers/recurring-engine.ts`) and the
 * application-layer engine (`packages/budgeting/src/application/recurring-engine.ts`).
 *
 * T-02-WORKER-FX: when rule.currency !== budget.currency, fxProvider.rateAsOf is
 * invoked and the returned rate is bounded `0 < rate < 1e6` before persisting
 * any draft. Mirrors the create-transaction.ts:101-103 guard (T-02-01).
 */

export interface FxProviderLike {
  rateAsOf(
    from: string,
    to: string,
    date: Date,
  ): Promise<{ rate: string; provider: string; isStale: boolean }>;
}

export interface RecurringFxInput {
  ruleCurrency: string;
  budgetCurrency: string;
  amountOriginalCents: string;
  dueDateStr: string;
  fxProvider: FxProviderLike;
}

export interface RecurringFxResult {
  fxRate: string;
  fxAsOf: string;
  amountConvertedCents: string;
}

export async function computeRecurringFx(
  input: RecurringFxInput,
): Promise<RecurringFxResult> {
  if (input.ruleCurrency === input.budgetCurrency) {
    return {
      fxRate: "1",
      fxAsOf: input.dueDateStr,
      amountConvertedCents: input.amountOriginalCents,
    };
  }

  const fx = await input.fxProvider.rateAsOf(
    input.ruleCurrency,
    input.budgetCurrency,
    new Date(input.dueDateStr + "T00:00:00Z"),
  );

  const rateNum = Number(fx.rate);
  if (!Number.isFinite(rateNum) || rateNum <= 0 || rateNum >= 1e6) {
    throw new Error(`FX rate out of bounds: ${fx.rate}`);
  }

  return {
    fxRate: fx.rate,
    fxAsOf: input.dueDateStr,
    amountConvertedCents: String(
      Math.round(Number(input.amountOriginalCents) * rateNum),
    ),
  };
}
