/**
 * transaction-list.tsx — RSC component that fetches and renders latest transactions.
 * Per UI-SPEC: dark Binance rows; amount color by kind; FX freshness badge on stale rows.
 * Plan 02-07: "edited" badge on rows with hasCorrections=true; clicking opens EditHistoryPanel.
 * Plan 02-09: imports TransactionSearchBar / TransactionFilterChips so consumers (RSC pages)
 * can compose search + filter on top of this list. The bulk-action-bar is a peer client
 * component owned by the page (lifts selection state outside the RSC tree).
 */
import { getTranslations } from "next-intl/server";
import { FxFreshnessBadge } from "./fx-freshness-badge";
import { TransactionRowClient } from "./transaction-row-client";
import { TransactionRowEdit } from "./transaction-row-edit";
import { serverApiFetch } from "@/lib/workspace-fetch.server";
// Plan 02-09: re-export the search/filter primitives so pages can compose them above this list.
export { TransactionSearchBar } from "./transaction-search-bar";
export { TransactionFilterChips } from "./transaction-filter-chips";
export { BulkActionBar } from "./bulk-action-bar";

interface Transaction {
  id: string;
  kind: string;
  amountOrig: string;
  currencyOrig: string;
  amountDefault: string;
  currencyDefault: string;
  fxRate: string;
  fxRateDate: string;
  fxProvider: string;
  transactionDate: string;
  note: string | null;
  accountId: string;
  categoryId: string | null;
  transferGroupId: string | null;
  correctsId?: string | null;
  isStale: boolean;
  hasCorrections?: boolean;
}

interface TransactionListProps {
  locale: string;
  wsId: string;
}

async function fetchTransactions(
  wsId: string,
  limit = 50,
): Promise<Transaction[]> {
  try {
    const res = await serverApiFetch(wsId, `/transactions?limit=${limit}`);
    if (!res.ok) return [];
    const data = (await res.json()) as { transactions: Transaction[] };
    return data.transactions ?? [];
  } catch {
    return [];
  }
}

function amountColor(kind: string): string {
  if (kind === "INCOME") return "text-[var(--trading-up)]";
  if (kind === "EXPENSE") return "text-[var(--trading-down)]";
  return "text-[var(--body)]";
}

function amountPrefix(kind: string): string {
  if (kind === "EXPENSE") return "−";
  if (kind === "INCOME") return "+";
  return "";
}

export async function TransactionList({ locale, wsId }: TransactionListProps) {
  const t = await getTranslations({ locale, namespace: "budgeting.transactions" });
  const transactions = await fetchTransactions(wsId);

  if (transactions.length === 0) {
    return (
      <div className="rounded-xl bg-[var(--surface-card-dark)] px-6 py-10 text-center">
        <p className="text-sm text-[var(--muted-foreground)]">{t("list.empty")}</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl bg-[var(--surface-card-dark)] overflow-hidden">
      <ul className="divide-y divide-[var(--hairline-on-dark)]">
        {transactions.map((tx) => (
          <li
            key={tx.id}
            className="flex items-center justify-between px-4 py-3 hover:bg-[var(--surface-elevated-dark)] transition-colors"
            data-testid={`transaction-row-${tx.id}`}
          >
            {/* Left: date + category/kind */}
            <div className="flex flex-col gap-0.5 min-w-0 flex-1">
              <span className="text-xs text-[var(--muted-foreground)] font-mono">
                {tx.transactionDate}
              </span>
              {/* Phase 2 UI shows EXPENSE only — kind/transfer label dropped. */}
              {tx.note && (
                <span className="text-xs text-[var(--muted-foreground)] truncate max-w-[200px]">
                  {tx.note}
                </span>
              )}
            </div>

            {/* Right: amount + badges */}
            <div className="flex flex-col items-end gap-1 ml-4 shrink-0">
              <span
                className={[
                  "font-mono text-base font-semibold",
                  amountColor(tx.kind),
                ].join(" ")}
                style={{ fontFamily: "var(--font-binom)" }}
                data-testid={`amount-${tx.id}`}
              >
                {amountPrefix(tx.kind)}
                {tx.amountOrig} {tx.currencyOrig}
              </span>
              {tx.isStale && (
                <FxFreshnessBadge
                  fxRateDate={tx.fxRateDate}
                  provider={tx.fxProvider}
                />
              )}
              {/* "edited" badge — client interactive: opens history panel on click */}
              {tx.hasCorrections && (
                <TransactionRowClient
                  transactionId={tx.id}
                  editedBadgeLabel={t("list.editedBadge")}
                />
              )}
              <TransactionRowEdit
                transaction={{
                  id: tx.id,
                  kind: tx.kind,
                  amountOrig: tx.amountOrig,
                  currencyOrig: tx.currencyOrig,
                  amountDefault: tx.amountDefault,
                  currencyDefault: tx.currencyDefault,
                  fxRate: tx.fxRate,
                  fxRateDate: tx.fxRateDate,
                  fxProvider: tx.fxProvider,
                  transactionDate: tx.transactionDate,
                  note: tx.note,
                  accountId: tx.accountId,
                  categoryId: tx.categoryId,
                  transferGroupId: tx.transferGroupId,
                  correctsId: tx.correctsId ?? null,
                }}
                ariaLabel={`Edit ${tx.note ?? tx.amountOrig}`}
                sheetTitle="Edit transaction"
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
