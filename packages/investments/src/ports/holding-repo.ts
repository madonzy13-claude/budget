/**
 * holding-repo.ts — HoldingRepo port (Phase 9). Tenant-scoped CRUD over
 * budgeting.investments. NO drizzle here; the adapter implements it. Returns the
 * Holding domain entity (value/P-L enrichment is a use-case concern, P06).
 */
import type { Holding, HoldingType } from "../domain/holding";

export interface NewHolding {
  name: string;
  holdingType: HoldingType;
  uiType: string | null;
  /** Possession-only curated icon key (e.g. "car"); null for every other type. */
  icon: string | null;
  /** Possession-only hex color (e.g. "#e63946"); null for every other type. */
  color: string | null;
  instrumentId: string | null;
  /** User-typed ticker for a manual (no-instrument) tracked holding. */
  manualTicker: string | null;
  buyPriceCents: bigint | null;
  buyCurrency: string | null;
  quantity: string;
  currentPriceCents: bigint | string | null;
  currentPriceCurrency: string | null;
  metal: string | null;
  metalKind: string | null;
  unitOfMeasure: string | null;
  /** Precious-metals bullion premium over spot, percent string ("20"=+20%); null = none. */
  premiumPct: string | null;
  // Deposit-only (null otherwise). Principal + currency ride buyPriceCents/buyCurrency.
  depositRateBps: number | null;
  depositStartDate: string | null;
  depositEndDate: string | null;
  depositCapFrequency: string | null;
}

/** D-06 Edit: the only mutable asset fields. Quantity / cost / type are
 *  ledger-owned (CR-01: a PATCH that wrote them raced /adjust). */
export interface AssetEdit {
  name?: string;
  currentPriceCurrency?: string | null;
  currentPriceCents?: bigint | string | null;
}

/** Autocomplete row (D-02): hidden (archived) assets included. */
export interface AssetNameRow {
  id: string;
  name: string;
  archived: boolean;
  instrumentId: string | null;
  quantity: string;
  currentPriceCents: string | null;
  currentPriceCurrency: string | null;
  buyCurrency: string | null;
  /** Ticker (tracked) — with instrumentName, how the UI names the unit. */
  symbol: string | null;
  instrumentName: string | null;
  holdingType: string;
  unitOfMeasure: string | null;
}

export interface HoldingRepo {
  create(
    tenantId: string,
    budgetId: string,
    userId: string,
    input: NewHolding,
  ): Promise<Holding>;
  update(
    tenantId: string,
    userId: string,
    id: string,
    input: AssetEdit,
  ): Promise<Holding | null>;
  listNames(
    tenantId: string,
    budgetId: string,
    uiType: string,
  ): Promise<AssetNameRow[]>;
  archive(tenantId: string, userId: string, id: string): Promise<void>;
  /** Round 5: an archived asset comes back by id (names never join). */
  restore(tenantId: string, userId: string, id: string): Promise<void>;
  /** Active (non-archived) holdings — or, with `hidden`, only the hidden
   *  (archived) ones; tracked-instrument current price joined from the cache. */
  listForBudget(
    tenantId: string,
    budgetId: string,
    userId: string,
    opts?: { hidden?: boolean | "all" },
  ): Promise<Holding[]>;
  reorder(
    tenantId: string,
    userId: string,
    orderedIds: string[],
  ): Promise<void>;
  findById(
    tenantId: string,
    userId: string,
    id: string,
  ): Promise<Holding | null>;
}
