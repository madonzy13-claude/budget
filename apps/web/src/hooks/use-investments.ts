"use client";
/**
 * use-investments.ts — Query hook for the investments holding list (Phase 9).
 *
 * Query key: ["budget", budgetId, "investments"]  (INV-16)
 * Mirrors use-wallets.ts: plain client fetch, offline handled by React Query
 * networkMode + the persisted query cache. GET /investments returns an enriched
 * payload ({ holdings, groupWeights }); the hook returns the holdings array.
 */
import { useQuery } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";

/** Locked 9-value holding type (INV-04) — mirrors the server contract. */
export type HoldingType =
  | "equities"
  | "etf"
  | "bond"
  | "crypto"
  | "reit"
  | "commodity"
  | "cash_fx"
  | "real_estate"
  | "other";

/**
 * Enriched holding row returned by GET /investments. Shape mirrors the server
 * EnrichedHoldingDto (packages/investments contracts/api.ts) — kept local so the
 * web app never imports server package types (hexagonal boundary).
 */
export interface HoldingDto {
  id: string;
  name: string;
  holdingType: HoldingType;
  /** Phase 9.1 user-facing type (11 values); null for pre-9.1 rows. */
  uiType: string | null;
  group: string | null;
  instrumentId: string | null;
  /** Precious-metals attributes (null otherwise). */
  metal: string | null;
  metalKind: string | null;
  unitOfMeasure: string | null;
  /** Bullion premium over spot, percent string ("20"=+20%); null = none. */
  premiumPct: string | null;
  /** Tracked-instrument ticker (e.g. AAPL); null for custom/cash/metals. */
  symbol: string | null;
  /** Tracked-instrument provider; 'manual' = user-priced (editable price, no auto
   *  refresh); null for custom/cash holdings. */
  instrumentProvider: string | null;
  isCustom: boolean;
  isDelisted: boolean;
  quantity: string;
  buyPriceCents: string | null;
  buyCurrency: string | null;
  currentPriceCents: string | null;
  currentPriceCurrency: string | null;
  /** ISO time the auto-fetched price was last refreshed (hourly cron); null for
   *  manual/cash holdings. Drives the "last updated" age in the holding sheet. */
  priceFetchedAt: string | null;
  /** value in the holding's current-price currency (cents, string). */
  valueCents: string;
  /** value in the budget default currency (cents, string). */
  valueInBudgetCents: string;
  /** signed P/L %, 1 decimal; null for cash / no-basis. */
  profitLossPct: number | null;
  /** signed absolute P/L in cents (server-computed); null for cash / no-basis. */
  profitLossCents: string | null;
  /** weight % within group (grouped) or whole portfolio (ungrouped). */
  weightPct: number;
  sortOrder: number;
  createdAt: string;
}

/**
 * Full GET /investments payload cached under the shared query key
 * ["budget", id, "investments"]. NOTE: the cache holds this OBJECT, not a bare
 * HoldingDto[] — every mutation's optimistic update must read/write `.holdings`
 * (see use-reorder/archive/update/create-holding), or `old.map`/`.filter` throws.
 */
export interface InvestmentsPayload {
  holdings: HoldingDto[];
  /** realized gains per group (budget cents, string) — see groupAggregate. */
  groupRealized: Record<string, string>;
}

function investmentsQueryOptions(
  budgetId: string,
  initialData?: HoldingDto[],
) {
  return {
    queryKey: ["budget", budgetId, "investments"] as const,
    queryFn: async (): Promise<InvestmentsPayload> => {
      const res = await clientApiFetch(`/budgets/${budgetId}/investments`, {
        signal: AbortSignal.timeout(7000),
      });
      if (!res.ok) throw new Error(await res.text());
      const json = await res.json();
      return {
        holdings: (json.holdings ?? []) as HoldingDto[],
        groupRealized: (json.groupRealized ?? {}) as Record<string, string>,
      };
    },
    initialData: initialData
      ? { holdings: initialData, groupRealized: {} }
      : undefined,
  };
}

export function useInvestments(budgetId: string, initialData?: HoldingDto[]) {
  return useQuery({
    ...investmentsQueryOptions(budgetId, initialData),
    select: (d: InvestmentsPayload) => d.holdings,
  });
}

/**
 * Realized gains per group (budget cents). Shares the useInvestments query cache
 * (same key → one fetch); pass a group name into groupAggregate's realized arg.
 */
export function useGroupRealized(budgetId: string): Record<string, string> {
  const q = useQuery({
    ...investmentsQueryOptions(budgetId),
    select: (d: InvestmentsPayload) => d.groupRealized,
  });
  return q.data ?? {};
}
