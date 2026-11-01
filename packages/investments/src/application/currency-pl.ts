/**
 * currency-pl.ts — R6 (user): a group's or an asset's P/L in a chosen
 * currency. Each asset's ledger is replayed with every entry at its own
 * date's rate (domain/currency-pl); only today's value uses today's rate.
 * Swaps between the requested assets are internal: not money put in.
 */
import { ok, err, type Result } from "neverthrow";
import Big from "big.js";
import type { HistoryRepo } from "../ports/history-repo";
import type { FxProvider } from "@budget/shared-kernel";
import { replayInCurrency } from "../domain/currency-pl";
import type { EnrichedHoldingDto } from "../contracts/api";

type ListHoldings = (input: {
  tenantId: string;
  budgetId: string;
  actorUserId: string;
  budgetCurrency: string;
  hidden?: boolean;
}) => Promise<Result<{ holdings: EnrichedHoldingDto[] }, Error>>;

export interface CurrencyPLDto {
  currency: string;
  valueCents: string;
  costCents: string;
  realizedCents: string;
  unrealizedCents: string;
  totalPLCents: string;
  contributedCents: string;
  /** total P/L ÷ money put in × 100; null when nothing was put in. */
  pct: number | null;
}

export function currencyPL(deps: {
  historyRepo: HistoryRepo;
  fxProvider: FxProvider;
  listHoldings: ListHoldings;
}) {
  return async (input: {
    tenantId: string;
    budgetId: string;
    actorUserId: string;
    budgetCurrency: string;
    currency: string;
    ids: string[];
  }): Promise<Result<CurrencyPLDto, Error>> => {
    try {
      const ids = new Set(input.ids);
      const [shown, hidden] = await Promise.all([
        deps.listHoldings(input),
        deps.listHoldings({ ...input, hidden: true }),
      ]);
      if (shown.isErr()) return err(shown.error);
      if (hidden.isErr()) return err(hidden.error);
      const holdings = [
        ...shown.value.holdings,
        ...hidden.value.holdings,
      ].filter((h) => ids.has(h.id));
      const ledgers = await Promise.all(
        holdings.map((h) =>
          deps.historyRepo.listForHolding(
            input.tenantId,
            input.actorUserId,
            h.id,
          ),
        ),
      );

      // Every (currency, date) the ledgers need, fetched once.
      const X = input.currency;
      const rates = new Map<string, number>();
      const rate = async (ccy: string, date: Date, key: string) => {
        if (ccy === X || rates.has(key)) return;
        const r = await deps.fxProvider.rateAsOf(
          ccy as never,
          X as never,
          date,
        );
        rates.set(key, Number(r.rate));
      };
      for (const entries of ledgers)
        for (const e of entries) {
          const ccy = e.amountCurrency ?? e.costCurrency;
          if (ccy)
            await rate(
              ccy,
              new Date(`${e.effectiveDate}T12:00:00Z`),
              `${ccy}|${e.effectiveDate}`,
            );
        }
      await rate(input.budgetCurrency, new Date(), "today");
      const rateAt = (ccy: string, date: string) =>
        ccy === X ? 1 : rates.get(`${ccy}|${date}`)!;

      let costCents = 0n;
      let realized = 0n;
      let contributed = 0n;
      ledgers.forEach((entries) => {
        const r = replayInCurrency(
          entries,
          rateAt,
          (e) => !!e.counterpartyHoldingId && ids.has(e.counterpartyHoldingId),
        );
        costCents += r.costCents;
        realized += r.realizedCents;
        contributed += r.contributedCents;
      });
      const today =
        input.budgetCurrency === X ? 1 : (rates.get("today") as number);
      const value = BigInt(
        holdings
          .reduce(
            (a, h) => a.plus(new Big(h.valueInBudgetCents || "0").times(today)),
            new Big(0),
          )
          .round(0, 2)
          .toFixed(0),
      );
      const unrealized = value - costCents;
      const plCents = unrealized + realized;
      return ok({
        currency: X,
        valueCents: value.toString(),
        costCents: costCents.toString(),
        realizedCents: realized.toString(),
        unrealizedCents: unrealized.toString(),
        totalPLCents: plCents.toString(),
        contributedCents: contributed.toString(),
        pct:
          contributed > 0n
            ? new Big(plCents.toString())
                .div(contributed.toString())
                .times(100)
                .toNumber()
            : null,
      });
    } catch (e) {
      return err(e as Error);
    }
  };
}
