/**
 * factory.ts — DI factory for the Investments bounded context (Phase 9).
 * Wires the P03 repos + P02 domain math + the existing FxProvider into the
 * 7 application use-cases consumed by the Hono investments route.
 */
import type { Pool } from "pg";
import type { FxProvider } from "@budget/shared-kernel";
import type { HoldingRepo } from "../ports/holding-repo";
import type { HistoryRepo } from "../ports/history-repo";
import type { InstrumentRepo } from "../ports/instrument-repo";
import type { PriceCacheRepo } from "../ports/price-cache-repo";
import type { PriceProvider } from "../ports/price-provider";
import { createHolding } from "../application/create-holding";
import { sellHolding } from "../application/sell-holding";
import { adjustHolding } from "../application/adjust-holding";
import { reverseHistoryEntry } from "../application/reverse-history-entry";
import {
  deleteHolding,
  listHistory,
  setTypeOrder,
  typeSummary,
} from "../application/history-queries";
import { updateHolding } from "../application/update-holding";
import { archiveHolding } from "../application/archive-holding";
import { listHoldings } from "../application/list-holdings";
import { reorderHoldings } from "../application/reorder-holdings";
import { searchInstruments } from "../application/search-instruments";
import { fetchInstrumentPrice } from "../application/fetch-instrument-price";

export function createInvestmentsModule(deps: {
  /** app_role pool — the rate-limit counter upsert runs here. */
  pool: Pool;
  fxProvider: FxProvider;
  holdingRepo: HoldingRepo;
  /** Phase 13 history ledger (sell / first entry / delete). */
  historyRepo: HistoryRepo;
  instrumentRepo: InstrumentRepo;
  priceCacheRepo: PriceCacheRepo;
  priceProvider: PriceProvider;
}) {
  const sell = sellHolding({
    holdingRepo: deps.holdingRepo,
    historyRepo: deps.historyRepo,
    fxProvider: deps.fxProvider,
  });
  const ledger = {
    holdingRepo: deps.holdingRepo,
    historyRepo: deps.historyRepo,
  };
  return {
    sellHolding: sell,
    adjustHolding: adjustHolding({ ...ledger, sellHolding: sell }),
    reverseHistoryEntry: reverseHistoryEntry(ledger),
    deleteHolding: deleteHolding(ledger),
    listHistory: listHistory(ledger),
    typeSummary: typeSummary({
      historyRepo: deps.historyRepo,
      fxProvider: deps.fxProvider,
    }),
    setTypeOrder: setTypeOrder(ledger),
    createHolding: createHolding({
      holdingRepo: deps.holdingRepo,
      historyRepo: deps.historyRepo,
    }),
    updateHolding: updateHolding({ holdingRepo: deps.holdingRepo }),
    archiveHolding: archiveHolding({ holdingRepo: deps.holdingRepo }),
    listHoldings: listHoldings({
      holdingRepo: deps.holdingRepo,
      fxProvider: deps.fxProvider,
    }),
    reorderHoldings: reorderHoldings({ holdingRepo: deps.holdingRepo }),
    searchInstruments: searchInstruments({
      instrumentRepo: deps.instrumentRepo,
    }),
    fetchInstrumentPrice: fetchInstrumentPrice({
      pool: deps.pool,
      priceProvider: deps.priceProvider,
      instrumentRepo: deps.instrumentRepo,
      priceCacheRepo: deps.priceCacheRepo,
      fxProvider: deps.fxProvider,
    }),
  };
}
