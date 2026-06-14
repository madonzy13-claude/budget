"use client";
/**
 * use-online-sync.ts — Reconnect-replay hook (PWAX-03)
 *
 * Replays every item in the offline queue, re-using each item's ORIGINAL
 * idempotencyKey (server dedupes via same key).
 *
 * Replay rules:
 *   2xx → removeFromQueue + invalidate [transactions], [spendings-summary], [tasks pending]
 *   4xx → markQueueItemFailed (moves to sync-issues for user review)
 *   5xx / network throw → leave in queue for next reconnect (best-effort)
 *
 * TRIGGERS — replay fires on ALL of:
 *   1. window "online"          (the original signal)
 *   2. document visibilitychange → visible
 *   3. window "focus"
 * iOS reports the "online" event UNRELIABLY (it often never fires after the
 * network returns while the PWA was backgrounded), so returning to the app
 * (visibility/focus) re-probes and drains the queue. This is what closes
 * Phase-08 UAT test 4 robustly on iOS.
 *
 * NO DOUBLE-WRITE on overlapping triggers (online + focus/visibility firing
 * together): three layers make it safe —
 *   (a) an in-flight re-entrancy guard skips a new pass while one is running (the
 *       running pass re-reads the queue at the top, so newly-enqueued items still
 *       get a later pass);
 *   (b) replay re-uses the STORED idempotencyKey verbatim;
 *   (c) the server dedupes on Idempotency-Key (T-08-03-02) as a backstop.
 *
 * Mount this hook ONCE in the (app) layout client island.
 */
import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { clientApiFetch } from "@/lib/budget-fetch";
import {
  getOfflineQueue,
  removeFromQueue,
  markQueueItemFailed,
} from "@/lib/offline-queue";

export function useOnlineSync() {
  const qc = useQueryClient();
  // Re-entrancy guard — true while a replay pass is draining the queue.
  const inFlight = useRef(false);

  useEffect(() => {
    async function replay() {
      // Skip if a pass is already running — it re-reads the queue at the top so
      // it will drain everything (including items enqueued after it started gets
      // picked up by the NEXT trigger). Prevents two concurrent passes from both
      // POSTing the same queued item.
      if (inFlight.current) return;
      inFlight.current = true;
      try {
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
      } finally {
        inFlight.current = false;
      }
    }

    function onVisible() {
      // Only a tab BECOMING visible should drain — hidden→hidden is a no-op.
      if (document.visibilityState === "visible") void replay();
    }

    window.addEventListener("online", replay);
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", replay);
    return () => {
      window.removeEventListener("online", replay);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", replay);
    };
  }, [qc]);
}
