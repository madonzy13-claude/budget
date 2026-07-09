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
  group: string | null;
  instrumentId: string | null;
  /** User-typed ticker for a manual (no-instrument) tracked holding. */
  manualTicker: string | null;
  buyPriceCents: bigint | null;
  buyCurrency: string | null;
  quantity: string;
  currentPriceCents: bigint | null;
  currentPriceCurrency: string | null;
  metal: string | null;
  metalKind: string | null;
  unitOfMeasure: string | null;
  /** Precious-metals bullion premium over spot, percent string ("20"=+20%); null = none. */
  premiumPct: string | null;
}

export interface HoldingRepo {
  create(
    tenantId: string,
    budgetId: string,
    userId: string,
    input: NewHolding,
  ): Promise<Holding>;
  /** Overwrites the mutable fields (callers read-modify-write). */
  update(
    tenantId: string,
    userId: string,
    id: string,
    input: NewHolding,
  ): Promise<Holding | null>;
  archive(tenantId: string, userId: string, id: string): Promise<void>;
  /** Active (non-archived) holdings; tracked-instrument current price joined from the cache. */
  listForBudget(
    tenantId: string,
    budgetId: string,
    userId: string,
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
