import Big from "big.js";
import { ok, err, type Result } from "neverthrow";
import type { FxProvider } from "@budget/shared-kernel";
import type { HoldingRepo } from "../ports/holding-repo";
import {
  holdingValue,
  profitLossPct,
  profitLossCents,
  portfolioWeights,
  groupWeights,
  type RateMap,
} from "../domain/portfolio-metrics";
import type { EnrichedHoldingDto } from "../contracts/api";

/**
 * Enriched holdings read (INV-08/09/10 + B4). HoldingRepo.listForBudget JOINs
 * instrument_price_cache so TRACKED holdings already carry the latest cron price
 * (the add-time holding-row price is the optimistic fallback); CUSTOM holdings
 * keep their row price. This use-case layers value / P-L % / weight % on top,
 * all denominated in the budget default currency via the existing FxProvider.
 */
export function listHoldings(deps: {
  holdingRepo: HoldingRepo;
  fxProvider: FxProvider;
}) {
  return async (input: {
    tenantId: string;
    budgetId: string;
    actorUserId: string;
    budgetCurrency: string;
  }): Promise<
    Result<
      { holdings: EnrichedHoldingDto[]; groupWeights: Record<string, number> },
      Error
    >
  > => {
    try {
      const holdings = await deps.holdingRepo.listForBudget(
        input.tenantId,
        input.budgetId,
        input.actorUserId,
      );
      const budgetCcy = input.budgetCurrency;
      const asOf = new Date();
      const rateCache = new Map<string, string>();
      const getRate = async (from: string, to: string): Promise<string> => {
        if (from === to) return "1";
        const k = `${from}->${to}`;
        const hit = rateCache.get(k);
        if (hit !== undefined) return hit;
        try {
          const { rate } = await deps.fxProvider.rateAsOf(
            from as never,
            to as never,
            asOf,
          );
          rateCache.set(k, rate);
          return rate;
        } catch {
          rateCache.set(k, "1");
          return "1";
        }
      };

      // Re-denominate the live price into the currency the user chose for the
      // holding when they differ (metals: the cache price is USD but the user
      // valued the coins in PLN). Mutates the price into displayCurrency so all
      // downstream value/P-L math reads a single, user-facing currency.
      for (const h of holdings) {
        const priceCcy = h.currentPriceCurrency;
        const displayCcy = h.displayCurrency;
        if (
          h.currentPriceCents !== null &&
          priceCcy &&
          displayCcy &&
          priceCcy !== displayCcy
        ) {
          const rate = await getRate(priceCcy, displayCcy);
          const converted = new Big(h.currentPriceCents.toString()).times(
            new Big(rate),
          );
          h.currentPriceCents = BigInt(converted.toFixed(0));
          h.currentPriceCurrency = displayCcy;
        }
      }

      // value-currency -> budget-ccy rate map (weights denominator).
      const valueCcys = Array.from(
        new Set(
          holdings
            .map((h) => h.currentPriceCurrency ?? h.buyCurrency)
            .filter((c): c is string => !!c),
        ),
      );
      const rateMap: RateMap = {};
      for (const c of valueCcys) rateMap[c] = await getRate(c, budgetCcy);

      const weights = portfolioWeights(holdings, rateMap, budgetCcy);
      const gWeights = groupWeights(holdings, rateMap, budgetCcy);

      const enriched: EnrichedHoldingDto[] = [];
      for (const h of holdings) {
        const value = holdingValue(h); // cents, in the holding's value currency
        const valueCcy = h.currentPriceCurrency ?? h.buyCurrency ?? budgetCcy;
        const toBudget = rateMap[valueCcy] ?? "1";
        const valueInBudget = value.times(new Big(toBudget));

        // P/L converts current -> buy currency only when they differ.
        const plRate =
          h.currentPriceCurrency &&
          h.buyCurrency &&
          h.currentPriceCurrency !== h.buyCurrency
            ? await getRate(h.currentPriceCurrency, h.buyCurrency)
            : "1";

        enriched.push({
          id: h.id,
          name: h.name,
          holdingType: h.holdingType,
          uiType: h.uiType,
          group: h.group,
          instrumentId: h.instrumentId,
          metal: h.metal,
          metalKind: h.metalKind,
          unitOfMeasure: h.unitOfMeasure,
          premiumPct: h.premiumPct,
          symbol: h.symbol,
          instrumentName: h.instrumentName,
          instrumentProvider: h.provider,
          isCustom: h.isCustom(),
          // Delisted chrome is surfaced via the INVESTMENT_INSTRUMENT_DELISTED
          // task (09-04); per-row enrichment is deferred to P07.
          isDelisted: false,
          quantity: h.quantity,
          buyPriceCents:
            h.buyPriceCents === null ? null : h.buyPriceCents.toString(),
          buyCurrency: h.buyCurrency,
          currentPriceCents:
            h.currentPriceCents === null
              ? null
              : h.currentPriceCents.toString(),
          currentPriceCurrency: h.currentPriceCurrency,
          priceFetchedAt: h.priceFetchedAt
            ? h.priceFetchedAt.toISOString()
            : null,
          valueCents: value.toFixed(0),
          valueInBudgetCents: valueInBudget.toFixed(0),
          profitLossPct: profitLossPct(h, plRate),
          profitLossCents: profitLossCents(h, plRate),
          weightPct: weights.get(h.id) ?? 0,
          sortOrder: h.sortOrder,
          createdAt: h.createdAt.toISOString(),
        });
      }

      return ok({
        holdings: enriched,
        groupWeights: Object.fromEntries(gWeights),
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}
