"use client";
/**
 * asset-ledger.tsx — the L3 "underground" strip under an open asset (13.1
 * D-12..D-19, D-28).
 *
 * Same left edge as the asset row, a step darker with muted text and an inset
 * top shadow on the first row (the spendings "to confirm" look). Fetched on
 * first open. The server decides what is deletable (newest entry only, linked
 * legs newest in both assets, interest never) — the client only renders it.
 */
import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAssetEntries, type EntryDto } from "@/hooks/use-asset-entries";
import { useDeleteEntry } from "@/hooks/use-delete-entry";
import { LedgerRow, kindKey, ledgerDate } from "./ledger-row";
import { LedgerDeleteConfirm } from "./ledger-delete-confirm";

interface AssetLedgerProps {
  budgetId: string;
  assetId: string;
  assetName: string;
  open: boolean;
}

const rowKeyOf = (e: EntryDto) => e.id ?? `interest-${e.effectiveDate}`;

export function AssetLedger({
  budgetId,
  assetId,
  assetName,
  open,
}: AssetLedgerProps) {
  const t = useTranslations("budget.investments");
  const locale = useLocale();
  const { data: entries, isLoading } = useAssetEntries(budgetId, assetId, open);
  const deleteMut = useDeleteEntry(budgetId);
  const [revealed, setRevealed] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<EntryDto | null>(null);

  if (!open) return null;

  return (
    <div
      role="rowgroup"
      aria-label={`${assetName}`}
      data-testid={`asset-ledger-${assetId}`}
      style={{
        backgroundColor: "var(--surface-sunken-dark)",
        color: "var(--muted-foreground)",
      }}
      className="flex flex-col"
    >
      {isLoading || !entries
        ? [0, 1, 2].map((i) => (
            <div
              key={i}
              data-testid="ledger-skeleton"
              className="min-h-[40px] animate-pulse px-2 py-1"
              style={{
                boxShadow:
                  i === 0 ? "inset 0 6px 8px -6px rgba(0,0,0,0.7)" : undefined,
              }}
            >
              <div
                className="mt-2 h-3 w-2/3 rounded"
                style={{ backgroundColor: "var(--surface-card-dark)" }}
              />
            </div>
          ))
        : entries.map((e, i) => {
            const key = rowKeyOf(e);
            return (
              <LedgerRow
                key={key}
                rowKey={key}
                entry={e}
                first={i === 0}
                revealed={revealed === key}
                onTap={() => setRevealed((r) => (r === key ? null : key))}
                onDelete={() => setConfirming(e)}
              />
            );
          })}
      <LedgerDeleteConfirm
        entry={confirming}
        assetName={assetName}
        kind={confirming ? t(kindKey(confirming)) : ""}
        date={confirming ? ledgerDate(confirming.effectiveDate, locale) : ""}
        onOpenChange={(o) => !o && setConfirming(null)}
        onConfirm={() => {
          if (confirming?.id) deleteMut.mutate({ entryId: confirming.id });
          setConfirming(null);
          setRevealed(null);
        }}
      />
    </div>
  );
}
