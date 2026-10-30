/**
 * investment-invalidate.ts — Phase 13.1 investment write helpers.
 *
 * One POST/PATCH/DELETE wrapper (clientApiWrite: honest offline, no queue), one
 * typed refusal, one refusal → i18n map and one cache-invalidation rule. A
 * write that moved a wallet balance (sale into a wallet, or deleting it) also
 * refreshes the wallet family: balance, reserves, cushion, tasks, projection
 * (D-21, D-37 — the server recomputes RESERVE/CUSHION tasks after commit).
 */
import type { QueryClient } from "@tanstack/react-query";
import { clientApiWrite } from "@/lib/offline-write";
import { typeSummaryKey } from "@/hooks/use-type-summary";

/** Server refusal with its code (e.g. fx_unavailable + currency/date). */
export class AssetWriteError extends Error {
  constructor(
    public readonly code: string,
    public readonly currency?: string,
    public readonly date?: string,
  ) {
    super(code);
  }
}

/** budget.investments key for a refusal code — never raw server text. */
export function assetRefusalKey(code: string): string {
  switch (code) {
    case "not_newest":
    case "linked_not_newest":
    case "stale":
      return "swap.err.staleEntry";
    case "before_latest_entry":
      return "swap.err.beforeLatest";
    case "fx_unavailable":
      return "swap.err.fx";
    default:
      return "swap.err.saveFailed";
  }
}

export async function assetWrite<T>(
  path: string,
  method: "POST" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const res = await clientApiWrite(path, {
    method,
    ...(body === undefined
      ? {}
      : {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }),
  });
  if (!res.ok) {
    const j = (await res.json().catch(() => ({}))) as {
      error?: string;
      currency?: string;
      date?: string;
    };
    throw new AssetWriteError(j.error ?? "save_failed", j.currency, j.date);
  }
  return (await res.json()) as T;
}

export function invalidateInvestments(
  qc: QueryClient,
  budgetId: string,
  { walletTouched }: { walletTouched: boolean },
): void {
  // Prefix: holdings, entries, autocomplete names.
  void qc.invalidateQueries({ queryKey: ["budget", budgetId, "investments"] });
  void qc.invalidateQueries({ queryKey: typeSummaryKey(budgetId) });
  void qc.invalidateQueries({ queryKey: ["budget", budgetId, "overview"] });
  if (!walletTouched) return;
  void qc.invalidateQueries({ queryKey: ["budget", budgetId, "wallets"] });
  void qc.invalidateQueries({ queryKey: ["budget", budgetId, "reserves"] });
  void qc.invalidateQueries({ queryKey: ["tasks", budgetId, "pending"] });
  void qc.invalidateQueries({ queryKey: ["cushion-summary", budgetId] });
  void qc.invalidateQueries({ queryKey: ["budget", budgetId, "projection"] });
}
