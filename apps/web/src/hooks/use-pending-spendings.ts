"use client";
/**
 * use-pending-spendings.ts — read the offline spendings queue reactively.
 *
 * `useSyncExternalStore` over the localStorage-backed store, so a queued add,
 * a local delete, and a successful flush all re-render the grid — in this tab
 * and (via the `storage` event) in any other tab of the same budget.
 */
import { useMemo, useSyncExternalStore } from "react";
import {
  getPendingSpendingsSnapshot,
  getPendingSpendingsServerSnapshot,
  subscribePendingSpendings,
  isDraftConfirm,
  type PendingSpending,
  type PendingSpendingInput,
} from "@/lib/pending-spendings";

function useQueue(): PendingSpending[] {
  return useSyncExternalStore(
    subscribePendingSpendings,
    getPendingSpendingsSnapshot,
    getPendingSpendingsServerSnapshot,
  );
}

/** Queued NEW spendings for this budget+month — the rows the grid renders. */
export function usePendingSpendings(
  budgetId: string,
  month: string,
): Array<PendingSpendingInput & { id: string; createdAt: string }> {
  const all = useQueue();
  return useMemo(
    () =>
      all
        .filter((e) => e.budgetId === budgetId && e.month === month)
        .filter((e) => !isDraftConfirm(e)),
    [all, budgetId, month],
  );
}

/** Is THIS draft's confirm waiting for a connection? */
export function usePendingDraftConfirm(draftId: string): boolean {
  const all = useQueue();
  return useMemo(
    () => all.some((e) => isDraftConfirm(e) && e.draftId === draftId),
    [all, draftId],
  );
}
