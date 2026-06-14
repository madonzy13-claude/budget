/**
 * offline-queue.ts — IndexedDB-backed offline write queue (PWAX-03)
 *
 * Enqueued txns are replayed by use-online-sync.ts on reconnect, re-using
 * the ORIGINAL idempotencyKey (critical — server dedupes via same key).
 *
 * No "use client" — pure browser API wrapper, no React, no framework imports.
 */
import { openBudgetDB } from "./offline-cache";
import { traceOffline } from "./offline-trace";

/**
 * Broadcast so queue-dependent UI (per-row pending marker, offline badge,
 * sync-issues list) re-reads the queue immediately after a mutation — they
 * can't await the IDB write themselves and would otherwise race it on mount.
 */
export const OFFLINE_QUEUE_CHANGED_EVENT = "offline-queue-changed";
function notifyQueueChanged(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(OFFLINE_QUEUE_CHANGED_EVENT));
  }
}

export interface OfflineTxn {
  /** UUID generated at enqueue time — re-used verbatim on replay (idempotency). */
  idempotencyKey: string;
  budgetId: string;
  payload: Record<string, unknown>;
  enqueuedAt: string;
  /** Set by markQueueItemFailed when the server returns a 4xx. */
  failReason?: string;
}

export async function enqueueOfflineTxn(
  txn: Omit<OfflineTxn, "failReason">,
): Promise<void> {
  // Instrumentation only (260614-kfw): the try/catch traces an IDB hang
  // (put-start logged, no put-ok) vs throw (ERROR + name) vs success, then
  // RE-THROWS to preserve the caller's existing error contract.
  try {
    traceOffline("enqueue:openDB");
    const db = await openBudgetDB();
    traceOffline("enqueue:put-start");
    await db.put("offline-queue", txn);
    traceOffline("enqueue:put-ok");
    db.close();
    notifyQueueChanged();
  } catch (e) {
    traceOffline(
      "enqueue:ERROR",
      `${(e as Error)?.name}: ${(e as Error)?.message}`,
    );
    throw e;
  }
}

export async function getOfflineQueue(): Promise<OfflineTxn[]> {
  const db = await openBudgetDB();
  const items = await db.getAll("offline-queue");
  db.close();
  return items as OfflineTxn[];
}

export async function removeFromQueue(idempotencyKey: string): Promise<void> {
  const db = await openBudgetDB();
  await db.delete("offline-queue", idempotencyKey);
  db.close();
  notifyQueueChanged();
}

export async function markQueueItemFailed(
  idempotencyKey: string,
  reason: string,
): Promise<void> {
  const db = await openBudgetDB();
  const item = await db.get("offline-queue", idempotencyKey);
  if (item) {
    await db.put("offline-queue", { ...item, failReason: reason });
  }
  db.close();
  notifyQueueChanged();
}
