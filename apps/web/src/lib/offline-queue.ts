/**
 * offline-queue.ts — IndexedDB-backed offline write queue (PWAX-03)
 *
 * Enqueued txns are replayed by use-online-sync.ts on reconnect, re-using
 * the ORIGINAL idempotencyKey (critical — server dedupes via same key).
 *
 * No "use client" — pure browser API wrapper, no React, no framework imports.
 */
import { openBudgetDB } from "./offline-cache";

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
  const db = await openBudgetDB();
  await db.put("offline-queue", txn);
  db.close();
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
}
