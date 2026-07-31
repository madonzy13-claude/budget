"use client";
/**
 * pending-spendings-flusher.tsx — retries the offline spendings queue.
 *
 * Mounted ONCE in the (app) shell (not in the grid) so a queue left behind by a
 * previous session flushes on the next app open, whatever tab the user lands on.
 * Fires on mount and on every `online` event; the store itself guards against
 * overlapping runs. Anything that actually saved invalidates the cached views so
 * the pending row is replaced by the real, engine-classified numbers.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { flushPendingSpendings } from "@/lib/pending-spendings";

export function PendingSpendingsFlusher() {
  const qc = useQueryClient();

  useEffect(() => {
    let cancelled = false;
    async function flush() {
      const { saved } = await flushPendingSpendings();
      // Saved rows touch summaries, reserves, tasks, overview and projection —
      // a blanket invalidate is both the cheapest and the most complete refresh
      // (identical to how connectivity recovery refreshes the app).
      if (saved > 0 && !cancelled) void qc.invalidateQueries();
    }
    void flush();
    window.addEventListener("online", flush);
    return () => {
      cancelled = true;
      window.removeEventListener("online", flush);
    };
  }, [qc]);

  return null;
}
