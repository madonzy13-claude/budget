"use client";
/**
 * use-create-transaction.ts — Optimistic POST mutation for new transactions.
 *
 * Robust-minimal offline (quick task 260614-q1v) + bulletproof timeout (260614-rwt):
 * there is NO offline queue and NO replay. onMutate prepends an optimistic row.
 * mutationFn FIRST checks navigator.onLine===false (the ONLY reliable signal on
 * iOS — the `true` value lies) as a fast-negative for an instant offline toast.
 * Otherwise it POSTs, wrapped in a manual Promise.race timeout (6000ms) because
 * iOS WebKit does NOT abort a hung POST via AbortSignal — the race GUARANTEES
 * onError fires. A dead link / timeout / 5xx routes to onError, which ROLLS BACK
 * the optimistic row and shows an honest offline toast. A genuine 4xx shows a
 * generic error toast. onSuccess swaps the server row in.
 *
 * QueryKey ["transactions", budgetId, month] matches useTransactions exactly.
 * Optimistic UUID is client-local; the server assigns its own id.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { clientApiFetch } from "@/lib/budget-fetch";
import { generateIdempotencyKey } from "@/lib/idempotency";
import { mapTxnRowToDTO } from "./use-transactions";

/**
 * Thrown when the server is unreachable (network throw / timeout / 5xx). Routes
 * React Query to onError, which rolls back the optimistic row and toasts the
 * honest "you're offline" message. A genuine 4xx throws a plain Error instead.
 */
export class OfflineWriteError extends Error {
  constructor() {
    super("offline-write");
    this.name = "OfflineWriteError";
  }
}

export interface CreateTransactionInput {
  categoryId: string;
  amountCents: number;
  date: string;
  currency: string;
  note?: string | null;
}

/**
 * Optimistically bumps the target category's spent so the just-added amount is
 * reflected in the grid immediately.
 *
 * Phase 05 reserve rewrite: drawable reserve is now REPLAY-DERIVED server-side
 * and is NO LONGER exposed in the spendings DTO (`reserveAvailableCents` is
 * gone). The client therefore cannot predict the reserve-used / overspent split
 * locally — that classification is owned by the engine. We bump `spentCents`
 * (and the optimistic `balanceCents` ignoring any reserve coverage) and leave
 * `reserveUsedCents` / `overspentCents` untouched; the authoritative values
 * arrive on the `spendings-summary` invalidation in onSettled (~immediately).
 *
 * Uses BigInt math to avoid float precision issues. Exported for unit testing.
 */
export function recomputeOptimistic(
  summary: Record<string, unknown> | undefined,
  input: CreateTransactionInput,
) {
  if (!summary) return summary;
  const cats = (summary as { categories?: Array<Record<string, unknown>> })
    .categories;
  if (!cats) return summary;
  return {
    ...summary,
    categories: cats.map((cat) => {
      if (cat.categoryId !== input.categoryId) return cat;
      const spentCents = BigInt(String(cat.spentCents ?? "0"));
      const newSpent = spentCents + BigInt(input.amountCents);
      const activeBudgetCents = BigInt(String(cat.activeBudgetCents ?? "0"));
      // Optimistic balance = limit − spent (no reserve coverage predicted).
      // The engine refetch reconciles reserve-used / overspent / balance.
      const newBalance = activeBudgetCents - newSpent;
      return {
        ...cat,
        spentCents: newSpent.toString(),
        balanceCents: newBalance.toString(),
      };
    }),
  };
}

/**
 * 260615-bse: optional callbacks. `onOfflineError` is invoked (instead of the
 * offline toast) when the write fails with OfflineWriteError — the rare iOS
 * "lying-true" case (onLine reports true on a dead link). The caller surfaces
 * the SAME offline dialog used by the device-knows-offline pre-insert path, so
 * both paths converge on one dialog instead of a toast. When `onOfflineError`
 * is absent, the prior offline toast is kept for back-compat.
 */
export interface UseCreateTransactionOptions {
  onOfflineError?: () => void;
}

export function useCreateTransaction(
  budgetId: string,
  month: string,
  opts?: UseCreateTransactionOptions,
) {
  const qc = useQueryClient();
  const t = useTranslations("grid.txn");

  return useMutation({
    mutationFn: async (input: CreateTransactionInput) => {
      // Fresh Idempotency-Key per mutation — the server dedupes if a response is
      // lost on a flaky link but the write actually landed.
      const key = generateIdempotencyKey();

      // FAST-NEGATIVE: navigator.onLine===false is RELIABLE on iOS (only the
      // `true` value lies — it reports online on a dead link). When the device
      // KNOWS it is offline, reject instantly so the offline toast is immediate
      // and we never issue a doomed POST. (Indicator-vs-gate: this is the WRITE
      // gate; the header pill is a separate, advisory indicator.)
      if (navigator.onLine === false) throw new OfflineWriteError();

      const payload = {
        date: input.date,
        category_id: input.categoryId,
        amount_original_cents: input.amountCents,
        currency_original: input.currency,
        note: input.note ?? null,
      };

      // ALWAYS attempt the POST when onLine is true (it LIES on iOS — reports
      // true on a dead link), so the real signal is whether the POST succeeds.
      //
      // BULLETPROOF TIMEOUT: on iOS WebKit, AbortSignal.timeout(8000) does NOT
      // abort a hung POST, so the fetch promise can NEVER settle → onError never
      // fires → the optimistic row spins forever. The GUARANTEE is a manual
      // Promise.race against a setTimeout that rejects with OfflineWriteError at
      // 6000ms (< the 8000ms AbortSignal so the race always wins first). The
      // AbortSignal is kept as a best-effort real cancel.
      let res: Response;
      let raceTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        const fetchPromise = clientApiFetch(
          `/budgets/${budgetId}/transactions`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Idempotency-Key": key,
              // Stamp tenant explicitly: harmless when online (matches pathname),
              // correct if the write fires off-page. clientApiFetch only injects
              // X-Budget-ID when absent, so this explicit header wins.
              "X-Budget-ID": budgetId,
            },
            body: JSON.stringify(payload),
            // Best-effort cancel — NOT relied on (iOS ignores it on a hang).
            signal: AbortSignal.timeout(8000),
          },
        );
        const timeoutPromise = new Promise<never>((_, reject) => {
          raceTimer = setTimeout(() => reject(new OfflineWriteError()), 6000);
        });
        res = await Promise.race([fetchPromise, timeoutPromise]);
      } catch {
        // Network throw (TypeError "Failed to fetch"), AbortError, OR the
        // race-timeout OfflineWriteError — all mean the server was unreachable →
        // rollback + honest offline toast.
        throw new OfflineWriteError();
      } finally {
        // Clear the timer so a fast success/failure doesn't leak it.
        if (raceTimer !== undefined) clearTimeout(raceTimer);
      }

      // Server-unreachable-class status (5xx) → treat as offline.
      if (res.status >= 500) throw new OfflineWriteError();
      // Genuine client error (4xx) → real validation error, generic toast.
      if (!res.ok) throw new Error(await res.text());

      return (await res.json()).transaction;
    },

    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["transactions", budgetId, month] });
      const previous = qc.getQueryData(["transactions", budgetId, month]);
      const optimisticId = `opt-${generateIdempotencyKey()}`;

      qc.setQueryData(["transactions", budgetId, month], (old: unknown) => {
        const arr = Array.isArray(old) ? old : [];
        return [
          {
            id: optimisticId,
            categoryId: input.categoryId,
            amountConvertedCents: input.amountCents.toString(),
            currencyConverted: input.currency,
            transactionDate: input.date,
            confirmedAt: new Date().toISOString(),
            note: input.note ?? null,
          },
          ...arr,
        ];
      });

      qc.setQueryData(["spendings-summary", budgetId, month], (old: unknown) =>
        recomputeOptimistic(old as Record<string, unknown>, input),
      );

      return { previous, optimisticId };
    },

    onError: (err, _input, ctx) => {
      // Roll back the optimistic row to the exact prior cache, and re-invalidate
      // the summary so the optimistic spent bump reverts to the engine value.
      if (ctx) {
        qc.setQueryData(["transactions", budgetId, month], ctx.previous);
      }
      qc.invalidateQueries({ queryKey: ["spendings-summary", budgetId] });

      // 260615-bse: lying-true case (onLine===true on a dead link) — the
      // optimistic row was inserted in onMutate and just rolled back above.
      // Surface the SAME offline dialog as the device-knows-offline path
      // (instead of a toast) when the caller wired onOfflineError. Genuine
      // 4xx errors always keep the generic write.failed toast.
      if (err instanceof OfflineWriteError) {
        if (opts?.onOfflineError) {
          opts.onOfflineError();
        } else {
          toast.error(t("write.offline"));
        }
        return;
      }
      toast.error(t("write.failed"));
    },

    onSuccess: (serverRow, _input, ctx) => {
      // serverRow is raw snake_case from serializeRow. Map to camelCase TxnDTO
      // so transactionsByCatId.get(categoryId) finds the row immediately,
      // without waiting for the invalidation refetch in onSettled.
      const mapped = mapTxnRowToDTO(serverRow);
      qc.setQueryData(["transactions", budgetId, month], (old: unknown) => {
        const arr = Array.isArray(old) ? old : [];
        return arr.map((t: Record<string, unknown>) =>
          t.id === ctx?.optimisticId ? mapped : t,
        );
      });
    },

    onSettled: () => {
      // Reserve is a CROSS-MONTH pool: a txn in ANY month re-splits EVERY
      // month's reserve (most-recent-first), so refresh ALL months' summaries,
      // not just the viewed one (partial key → matches every month).
      qc.invalidateQueries({
        queryKey: ["spendings-summary", budgetId],
      });
      qc.invalidateQueries({
        queryKey: ["transactions", budgetId, month],
      });
      // Spending draws/repays the reserve pool (any month) and shifts the
      // RESERVE_TOPUP mismatch — refresh the reserves tab + pill badge live.
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "reserves"] });
      qc.invalidateQueries({ queryKey: ["tasks", budgetId, "pending"] });
      // Overview cards/planned/overspent/wealth all derive from transactions —
      // refresh them live (partial key → every range/category variant).
      qc.invalidateQueries({ queryKey: ["budget", budgetId, "overview"] });
    },
  });
}
