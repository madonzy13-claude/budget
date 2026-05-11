"use client";

/**
 * edit-history-panel.tsx — Left-side Sheet panel showing the full correction chain.
 * Per UI-SPEC § Correction history side panel: 360px, renders chain rows ordered oldest first.
 * Fetches GET /api/transactions/:id/history on open.
 * D-01-a, T-2-07-04 (RLS scopes history — cross-tenant chain rows never returned).
 */
import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { clientApiFetch } from "@/lib/budget-fetch";

interface ChainRow {
  id: string;
  kind: string;
  amountOrig: string;
  currencyOrig: string;
  amountDefault: string;
  currencyDefault: string;
  transactionDate: string;
  note: string | null;
  correctsId: string | null;
  accountId: string;
  categoryId: string | null;
  transferGroupId: string | null;
  fxRate: string;
  fxRateDate: string;
  fxProvider: string;
}

export interface EditHistoryPanelProps {
  transactionId: string;
  open: boolean;
  onClose: () => void;
  /** API base URL — defaults to /api in Next.js. Pass absolute URL in tests. */
  apiBase?: string;
}

export function EditHistoryPanel({
  transactionId,
  open,
  onClose,
  apiBase = "",
}: EditHistoryPanelProps) {
  const t = useTranslations("budgeting");
  const [chain, setChain] = useState<ChainRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !transactionId) {
      setChain([]);
      return;
    }

    setLoading(true);
    setError(null);

    clientApiFetch(`/transactions/${transactionId}/history`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load history");
        return res.json() as Promise<{ chain: ChainRow[] }>;
      })
      .then((data) => {
        setChain(data.chain ?? []);
      })
      .catch((e: Error) => {
        setError(e.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [open, transactionId]);

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="left"
        className="w-[360px] bg-[var(--canvas-dark)] overflow-y-auto"
      >
        <SheetHeader className="mb-6">
          <SheetTitle className="text-[var(--on-dark)]">
            {t("transactions.history.panelTitle")}
          </SheetTitle>
        </SheetHeader>

        {loading && (
          <p className="text-sm text-[var(--muted-foreground)] px-1">Loading…</p>
        )}

        {error && (
          <p className="text-sm text-destructive px-1">{error}</p>
        )}

        {!loading && !error && (
          <div className="space-y-3">
            {chain.map((row, idx) => {
              const isOriginal = row.correctsId === null;
              return (
                <div
                  key={row.id}
                  data-testid={`chain-row-${idx}`}
                  className={[
                    "rounded-lg border px-4 py-3",
                    isOriginal
                      ? "border-[var(--border)] bg-[var(--surface-card-dark)] opacity-70"
                      : "border-[var(--primary-muted)] bg-[var(--surface-elevated-dark)]",
                  ].join(" ")}
                >
                  {/* Label: Original or Edited */}
                  <div className="flex items-center justify-between mb-1">
                    <span
                      className={[
                        "text-xs font-medium px-2 py-0.5 rounded-full",
                        isOriginal
                          ? "bg-[var(--muted)] text-[var(--muted-foreground)]"
                          : "bg-[var(--primary-muted)] text-[var(--primary)]",
                      ].join(" ")}
                    >
                      {isOriginal
                        ? t("transactions.history.originalLabel")
                        : t("transactions.history.editedLabel")}
                    </span>
                    <span className="text-xs text-[var(--muted-foreground)] font-mono">
                      {row.transactionDate}
                    </span>
                  </div>

                  {/* Amount */}
                  <div className="font-mono font-semibold text-sm text-[var(--body)]">
                    {row.amountOrig} {row.currencyOrig}
                  </div>

                  {/* Note */}
                  {row.note && (
                    <p className="text-xs text-[var(--muted-foreground)] mt-1 truncate">
                      {row.note}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
