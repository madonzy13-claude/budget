"use client";
/**
 * use-asset-entries.ts — an asset's L3 ledger (Phase 13.1, D-12..D-19).
 * Fetched lazily on first open; `deletable` and the interest rows come from the
 * server so the client never guesses (D-14, D-19). Lives under the
 * investments prefix, so every investments write refreshes it.
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
  /** ±qty to show: qtyDelta, or ±1 on a one-unit asset's value entry. */
  displayQty?: string | null;
  priceCents: string | null;
  amountCents: string | null;
  amountCurrency: string | null;
  displayAmountCents: string | null;
  displayCurrency: string | null;
  realizedBudgetCents: string | null;
  /** R6: realized in the asset's currency. */
  realizedCents?: string | null;
  realizedCurrency?: string | null;
  budgetCurrency: string | null;
  counterpartyName: string | null;
  counterpartyHoldingId?: string | null;
  transferId?: string | null;
  linked: boolean;
  walletName: string | null;
  walletDelta: string | null;
  /** R6: the booking's note. */
  note?: string | null;
  /** R6 Edit: the date range within this asset's ledger (null = open). */
  dateMin?: string | null;
  dateMax?: string | null;
  dateEditable?: boolean;
  backfilled: boolean;
  deletable: boolean;
  blockedReason: "not_newest" | "linked_not_newest" | "interest" | null;
  isLastEntry: boolean;
}

export const entriesKey = (budgetId: string, assetId: string) =>
  ["budget", budgetId, "investments", "entries", assetId] as const;

/** One asset's ledger — shared by the hook and the section's preload. */
export async function fetchAssetEntries(
  budgetId: string,
  assetId: string,
): Promise<EntryDto[]> {
  const res = await clientApiFetch(
    `/budgets/${budgetId}/investments/${assetId}/entries`,
    { signal: AbortSignal.timeout(7000) },
  );
  if (!res.ok) throw new Error(await res.text());
  return ((await res.json()) as { entries: EntryDto[] }).entries;
}

/** Round 4: preload every visible asset's ledger after first paint (deferred,
 *  3 at a time, cached ones skipped) so a first open shows rows, not a
 *  skeleton. */
export function usePrefetchAssetEntries(budgetId: string, ids: string[]) {
  const qc = useQueryClient();
  const key = ids.join(",");
  useEffect(() => {
    if (!key) return;
    let stop = false;
    const run = async () => {
      const todo = key
        .split(",")
        .filter((id) => !qc.getQueryData(entriesKey(budgetId, id)));
      const worker = async () => {
        while (!stop && todo.length) {
          const id = todo.shift()!;
          await qc
            .prefetchQuery({
              queryKey: entriesKey(budgetId, id),
              queryFn: () => fetchAssetEntries(budgetId, id),
            })
            .catch(() => {});
        }
      };
      await Promise.all([worker(), worker(), worker()]);
    };
    const idle = (cb: () => void) =>
      typeof window.requestIdleCallback === "function"
        ? window.requestIdleCallback(cb, { timeout: 1500 })
        : window.setTimeout(cb, 1500);
    const handle = idle(() => void run());
    return () => {
      stop = true;
      if (typeof window.cancelIdleCallback === "function")
        window.cancelIdleCallback(handle as number);
      else window.clearTimeout(handle as number);
    };
  }, [qc, budgetId, key]);
}

export function useAssetEntries(
  budgetId: string,
  assetId: string,
  enabled: boolean,
) {
  return useQuery({
    queryKey: entriesKey(budgetId, assetId),
    enabled,
    queryFn: () => fetchAssetEntries(budgetId, assetId),
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
