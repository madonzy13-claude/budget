"use client";
/**
 * pending-spendings-fallback.tsx — queued-offline spendings that no column shows.
 *
 * A spending typed offline normally renders as a pending row inside its category
 * column. After an offline cold start the cached category data can be gone, so
 * there are no columns at all — and the entry would look lost until it flushes.
 * This column-shaped card keeps those entries visible (and deletable) with only
 * what the queue itself stores.
 */
import { useTranslations, useLocale } from "next-intl";
import { RotateCw, Trash2 } from "lucide-react";
import { centsToBare } from "@/lib/cents-format";
import {
  removePendingSpending,
  type PendingSpendingInput,
} from "@/lib/pending-spendings";

type Entry = PendingSpendingInput & { id: string };

export function PendingSpendingsFallback({ entries }: { entries: Entry[] }) {
  const t = useTranslations("grid.txn");
  const locale = useLocale();

  return (
    <div
      data-testid="pending-spendings-fallback"
      className="w-max min-w-[140px] sm:min-w-[160px] flex flex-col flex-shrink-0 rounded-xl bg-[var(--surface-card-dark)] overflow-clip"
    >
      <div className="border-b border-[var(--hairline-dark)] px-2 py-2 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
        {t("pending.waiting")}
      </div>
      <div className="flex flex-col">
        {entries.map((e) => (
          <div
            key={e.id}
            data-testid={`txn-row-${e.amountCents}`}
            className="flex min-h-[40px] flex-col justify-center gap-0.5 px-3 py-1"
          >
            <div className="flex items-center gap-2">
              <span className="flex min-w-0 flex-1 items-baseline gap-2 text-sm text-[var(--body-on-dark)]">
                <span className="shrink-0">
                  {centsToBare(String(e.amountCents), locale)}
                </span>
                <RotateCw
                  data-testid="txn-row-pending"
                  aria-label={t("pending.badge")}
                  className="h-3 w-3 shrink-0 self-center text-[var(--muted-foreground)]"
                />
              </span>
              <button
                type="button"
                data-testid={`pending-fallback-delete-${e.amountCents}`}
                aria-label={t("action.delete")}
                onClick={() => removePendingSpending(e.id)}
                className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded hover:bg-[var(--surface-elevated-dark)]"
              >
                <Trash2
                  className="h-4 w-4 text-[var(--destructive)]"
                  aria-hidden="true"
                />
              </button>
            </div>
            <span className="block min-w-0 truncate text-[10px] leading-tight text-[var(--muted-foreground)]">
              {[e.categoryName, e.note].filter(Boolean).join(" · ")}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
