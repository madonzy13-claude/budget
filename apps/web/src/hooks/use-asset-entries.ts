"use client";
/**
 * use-asset-entries.ts — an asset's L3 ledger (Phase 13.1, D-12..D-19).
 * Fetched lazily on first open; `deletable` and the interest rows come from the
 * server so the client never guesses (D-14, D-19). Lives under the
 * investments prefix, so every investments write refreshes it.
 */
import { useQuery } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";

export type EntryKind =
  | "start"
  | "buy"
  | "add"
  | "value_change"
  | "withdraw"
  | "convert_out"
  | "convert_in"
  | "transfer_out"
  | "transfer_in"
  | "price_change"
  | "interest";

/** Mirror of EntryDto in packages/investments/src/contracts/api.ts. */
export interface EntryDto {
  id: string | null;
  kind: EntryKind;
  effectiveDate: string;
  createdAt: string | null;
  qtyDelta: string | null;
  priceCents: string | null;
  amountCents: string | null;
  amountCurrency: string | null;
  displayAmountCents: string | null;
  displayCurrency: string | null;
  realizedBudgetCents: string | null;
  budgetCurrency: string | null;
  counterpartyName: string | null;
  linked: boolean;
  walletName: string | null;
  walletDelta: string | null;
  backfilled: boolean;
  deletable: boolean;
  blockedReason: "not_newest" | "linked_not_newest" | "interest" | null;
  isLastEntry: boolean;
}

export const entriesKey = (budgetId: string, assetId: string) =>
  ["budget", budgetId, "investments", "entries", assetId] as const;

export function useAssetEntries(
  budgetId: string,
  assetId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: entriesKey(budgetId, assetId),
    enabled,
    queryFn: async () => {
      const res = await clientApiFetch(
        `/budgets/${budgetId}/investments/${assetId}/entries`,
        { signal: AbortSignal.timeout(7000) },
      );
      if (!res.ok) throw new Error(await res.text());
      return ((await res.json()) as { entries: EntryDto[] }).entries;
    },
  });
}

/** D-15: a new entry appends in time — the newest stored entry's date (interest
 *  rows are synthesized, not entries). Null while loading or with no entries. */
export function useMinEntryDate(
  budgetId: string,
  holdingId: string,
  enabled = true,
): string | null {
  const entries = useAssetEntries(budgetId, holdingId, enabled).data;
  return (
    entries
      ?.filter((e) => e.kind !== "interest")
      .reduce<string | null>(
        (m, e) => (m === null || e.effectiveDate > m ? e.effectiveDate : m),
        null,
      ) ?? null
  );
}
