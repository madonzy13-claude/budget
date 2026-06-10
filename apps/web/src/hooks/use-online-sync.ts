"use client";
/**
 * use-online-sync.ts — Reconnect-replay hook (PWAX-03)
 *
 * Listens for window "online" and replays every item in the offline queue,
 * re-using each item's ORIGINAL idempotencyKey (server dedupes via same key).
 *
 * Replay rules:
 *   2xx → removeFromQueue + invalidate [transactions], [spendings-summary], [tasks pending]
 *   4xx → markQueueItemFailed (moves to sync-issues for user review)
 *   5xx / network throw → leave in queue for next reconnect (best-effort)
 *
 * Mount this hook ONCE in the (app) layout client island.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import {
  getOfflineQueue,
  removeFromQueue,
  markQueueItemFailed,
} from "@/lib/offline-queue";

export function useOnlineSync() {
  const qc = useQueryClient();

  useEffect(() => {
    async function replay() {
      const queue = await getOfflineQueue();
      for (const item of queue) {
        // Skip items already marked failed — those are in sync-issues awaiting user action
        if (item.failReason) continue;
        try {
          const res = await clientApiFetch(
            `/budgets/${item.budgetId}/transactions`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                // SAME key as stored at enqueue time — server returns cached 2xx (T-08-03-02)
                "Idempotency-Key": item.idempotencyKey,
              },
              body: JSON.stringify(item.payload),
            },
          );

          if (res.ok || res.status === 200) {
            await removeFromQueue(item.idempotencyKey);
            qc.invalidateQueries({
              queryKey: ["transactions", item.budgetId],
            });
            qc.invalidateQueries({
              queryKey: ["spendings-summary", item.budgetId],
            });
            qc.invalidateQueries({
              queryKey: ["tasks", item.budgetId, "pending"],
            });
          } else if (res.status >= 400 && res.status < 500) {
            // 4xx → permanent failure; move to sync-issues for user review
            const reason = (await res.text()) || "UNKNOWN";
            await markQueueItemFailed(item.idempotencyKey, reason);
          }
          // 5xx or other: leave in queue for next reconnect (best-effort D-02)
        } catch {
          // Network still down or throw — leave in queue
        }
      }
    }

    window.addEventListener("online", replay);
    return () => window.removeEventListener("online", replay);
  }, [qc]);
}
