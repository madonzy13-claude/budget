"use client";
/**
 * pending-spendings.ts — the ONE offline write queue in the app (260731-osq).
 *
 * A spending typed while offline / on a dead link is NOT rolled back anymore: it
 * is stored here (localStorage → survives a tab or app close), rendered in its
 * column as a pending row, and POSTed automatically when the connection returns
 * (see components/common/pending-spendings-flusher.tsx).
 *
 * Scope guard: this covers the spendings quick-add ONLY. Every OTHER write keeps
 * the honest-refuse contract of `clientApiWrite` (see project_offline_architecture
 * — the 2026-06 decision to drop the global queue/replay stands; the user asked
 * for this one surface to keep the entry instead of discarding it).
 *
 * Retries reuse the entry's STORED Idempotency-Key so a write whose response was
 * lost on a flaky link is deduped server-side instead of double-posting.
 */
import { clientApiWrite, isOfflineWriteError } from "./offline-write";
import { generateIdempotencyKey } from "./idempotency";

export const PENDING_SPENDINGS_KEY = "budget-pending-spendings-v1";

export interface PendingSpendingInput {
  budgetId: string;
  /** YYYY-MM the entry belongs to (the grid month it renders in). */
  month: string;
  categoryId: string;
  /** Stored so the entry can still be LABELLED after an offline cold start,
   *  where the cached category list may be gone (round 3). */
  categoryName?: string;
  amountCents: number;
  currency: string;
  /** ISO YYYY-MM-DD spending date. */
  date: string;
  note: string | null;
}

/** A scheduled draft the user confirmed while the write could not land. */
export interface PendingDraftConfirmInput {
  budgetId: string;
  month: string;
  draftId: string;
  /** Amount the user typed before confirming; null = confirm as-is. */
  amountOverrideCents: number | null;
}

interface PendingBase {
  /** Client-local row id, `pending-<uuid>`. Never a server id. */
  id: string;
  idempotencyKey: string;
  createdAt: string;
}

/**
 * `kind` is absent on entries written before draft confirms joined the queue —
 * `isDraftConfirm` treats a missing kind as a create, so an old queue still
 * flushes correctly after an update.
 */
export type PendingSpending = PendingBase &
  (
    | (PendingSpendingInput & { kind?: "create" })
    | (PendingDraftConfirmInput & { kind: "confirm-draft" })
  );

export function isDraftConfirm(
  entry: PendingSpending,
): entry is PendingBase & PendingDraftConfirmInput & { kind: "confirm-draft" } {
  return entry.kind === "confirm-draft";
}

const listeners = new Set<() => void>();

const EMPTY: PendingSpending[] = [];
// Parsed-snapshot cache keyed on the RAW string: `useSyncExternalStore` needs a
// stable reference between renders, and keying on the raw value keeps us honest
// when storage changes behind our back (another tab, a test's clear()).
let cachedRaw: string | null = null;
let cachedList: PendingSpending[] = EMPTY;

function read(): PendingSpending[] {
  if (typeof localStorage === "undefined") return EMPTY;
  let raw: string | null;
  try {
    raw = localStorage.getItem(PENDING_SPENDINGS_KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cachedRaw) return cachedList;
  cachedRaw = raw;
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    cachedList = Array.isArray(parsed) ? (parsed as PendingSpending[]) : EMPTY;
  } catch {
    // Corrupt storage must never break the grid.
    cachedList = EMPTY;
  }
  return cachedList;
}

/** Stable snapshot for `useSyncExternalStore` (see hooks/use-pending-spendings). */
export function getPendingSpendingsSnapshot(): PendingSpending[] {
  return read();
}

/** SSR snapshot — there is no queue on the server. */
export function getPendingSpendingsServerSnapshot(): PendingSpending[] {
  return EMPTY;
}

function write(entries: PendingSpending[]) {
  try {
    localStorage.setItem(PENDING_SPENDINGS_KEY, JSON.stringify(entries));
  } catch {
    /* quota / private mode — the entry is lost, nothing better to do */
  }
  for (const fn of listeners) fn();
}

/** All queued entries, oldest first — optionally scoped to one budget+month. */
export function listPendingSpendings(
  budgetId?: string,
  month?: string,
): PendingSpending[] {
  const all = read();
  if (!budgetId) return all;
  return all.filter(
    (e) =>
      e.budgetId === budgetId && (month === undefined || e.month === month),
  );
}

function stamp(): PendingBase {
  return {
    id: `pending-${generateIdempotencyKey()}`,
    idempotencyKey: generateIdempotencyKey(),
    createdAt: new Date().toISOString(),
  };
}

export function addPendingSpending(
  input: PendingSpendingInput & { idempotencyKey?: string },
): PendingSpending {
  // Inherit the key of the attempt that queued this, when there was one. The
  // replay below already SENDS the stored key; minting a fresh one here is what
  // stopped the server recognising the repeat — an aborted POST that had in
  // fact been written came back as a second transaction (260806).
  const { idempotencyKey, ...rest } = input;
  const entry: PendingSpending = {
    ...rest,
    ...stamp(),
    ...(idempotencyKey ? { idempotencyKey } : {}),
  };
  write([...read(), entry]);
  return entry;
}

/** Queue a draft confirm whose POST could not land — replayed on reconnect. */
export function addPendingDraftConfirm(
  input: PendingDraftConfirmInput,
): PendingSpending {
  const entry: PendingSpending = {
    ...input,
    kind: "confirm-draft",
    ...stamp(),
  };
  write([...read(), entry]);
  return entry;
}

export function removePendingSpending(id: string) {
  write(read().filter((e) => e.id !== id));
}

/** Subscribe to queue changes — in this tab AND (via `storage`) in others. */
export function subscribePendingSpendings(cb: () => void): () => void {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === PENDING_SPENDINGS_KEY) cb();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

let flushing = false;

/**
 * POST every queued entry, oldest first. Stops at the first still-unreachable
 * write (no point hammering the rest); drops an entry the server permanently
 * rejects (4xx) since a retry can never succeed.
 */
export async function flushPendingSpendings(): Promise<{
  saved: number;
  failed: number;
}> {
  if (flushing) return { saved: 0, failed: 0 };
  flushing = true;
  let saved = 0;
  let failed = 0;
  try {
    for (const entry of read()) {
      // A queued draft confirm replays against the CONFIRM endpoint — posting it
      // as a new transaction would double-count the draft.
      const [path, body] = isDraftConfirm(entry)
        ? [
            `/budgets/${entry.budgetId}/scheduled-payments/drafts/${entry.draftId}/confirm`,
            entry.amountOverrideCents !== null
              ? { amount_override_cents: entry.amountOverrideCents }
              : {},
          ]
        : [
            `/budgets/${entry.budgetId}/transactions`,
            {
              date: entry.date,
              category_id: entry.categoryId,
              amount_original_cents: entry.amountCents,
              currency_original: entry.currency,
              note: entry.note,
            },
          ];
      let res: Response;
      try {
        res = await clientApiWrite(path, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key": entry.idempotencyKey,
            // The flush can fire off the budget page, where clientApiFetch
            // cannot derive the tenant from the pathname — stamp it explicitly.
            "X-Budget-ID": entry.budgetId,
          },
          body: JSON.stringify(body),
        });
      } catch (err) {
        // Still offline / unreachable → keep the whole queue for the next try.
        if (isOfflineWriteError(err)) break;
        break;
      }
      if (res.ok) {
        removePendingSpending(entry.id);
        saved++;
        continue;
      }
      // clientApiWrite already maps 5xx/network to OfflineWriteError, so a
      // response here is a genuine client error — it will never succeed.
      removePendingSpending(entry.id);
      failed++;
    }
  } finally {
    flushing = false;
  }
  return { saved, failed };
}
