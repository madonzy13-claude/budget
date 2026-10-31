"use client";
/**
 * asset-ledger.tsx — the L3 "underground" strip under an open asset (13.1
 * D-12..D-19, D-28).
 *
 * Same left edge as the asset row, a step darker with muted text and an inset
 * top shadow on the first row (the spendings "to confirm" look). Fetched on
 * first open. The server decides what is deletable (newest entry only, linked
 * legs newest in both assets, interest never) — the client only renders it.
 *
 * 13.1 UAT 4/5: slides open/closed (CSS grid-rows, no layout jump), closes the
 * asset card with rounded bottom corners, and follows the asset row's swipe.
 */
import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useAssetEntries, type EntryDto } from "@/hooks/use-asset-entries";
import { useDeleteEntry } from "@/hooks/use-delete-entry";
import { LedgerRow, kindKey, ledgerDate } from "./ledger-row";
import { LedgerDeleteConfirm } from "./ledger-delete-confirm";
import { EntryEditDialog } from "./entry-edit-dialog";
import { useEditEntry } from "@/hooks/use-edit-entry";
import { SlideCollapse } from "@/components/common/slide-collapse";

interface AssetLedgerProps {
  budgetId: string;
  assetId: string;
  assetName: string;
  open: boolean;
  /** The asset row's swipe offset (px ≤ 0); `swiping` = mid-gesture. */
  swipeOffset?: number;
  swiping?: boolean;
  /** Round 4: open a linked entry's partner (holding id, transfer id). */
  onOpenLinked?: (holdingId: string, transferId: string) => void;
  /** Which partners are on screen (only those become links). */
  canOpen?: (holdingId: string) => boolean;
  /** Scroll to + highlight the row of this transfer (after a jump). */
  flashTransferId?: string | null;
  /** Cash / stablecoin: no "realized" on its rows (R6, user). */
  noRealized?: boolean;
}

const rowKeyOf = (e: EntryDto) => e.id ?? `interest-${e.effectiveDate}`;

export function AssetLedger({
  budgetId,
  assetId,
  assetName,
  open,
  swipeOffset = 0,
  swiping = false,
  onOpenLinked,
  canOpen,
  flashTransferId,
  noRealized,
}: AssetLedgerProps) {
  const t = useTranslations("budget.investments");
  const locale = useLocale();
  const { data: entries, isLoading } = useAssetEntries(budgetId, assetId, open);
  const deleteMut = useDeleteEntry(budgetId);
  const [confirming, setConfirming] = useState<EntryDto | null>(null);
  const [editing, setEditing] = useState<EntryDto | null>(null);
  const editMut = useEditEntry(budgetId);
  const stripRef = useRef<HTMLDivElement>(null);
  // After a jump from the partner: bring the matching row into view.
  useEffect(() => {
    if (!flashTransferId || !entries) return;
    stripRef.current
      ?.querySelector(`[data-transfer-id="${CSS.escape(flashTransferId)}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [flashTransferId, entries]);
  // Round 4: SlideCollapse mounts shut and opens next frame, so the FIRST
  // open slides too; kept mounted once seen so closing slides shut. Its clip
  // is vertical only (round-2 gap 5), so a swiped strip is never cut.
  return (
    <SlideCollapse open={open} keepMounted data-ledger-slide>
      <div
        role="rowgroup"
        aria-label={`${assetName}`}
        ref={stripRef}
        data-testid={`asset-ledger-${assetId}`}
        style={{
          backgroundColor: "var(--surface-ledger-dark)",
          color: "var(--muted-foreground)",
          transform: `translateX(${swipeOffset}px)`,
          transition: swiping ? "none" : "transform 200ms ease-out",
        }}
        className="flex flex-col overflow-hidden rounded-b-[var(--radius-md)]"
      >
        {isLoading || !entries
          ? [0, 1, 2].map((i) => (
              <div
                key={i}
                data-testid="ledger-skeleton"
                className="min-h-[40px] animate-pulse px-2 py-1"
                style={{
                  backgroundColor: "var(--surface-ledger-dark)",
                  boxShadow:
                    i === 0
                      ? "inset 0 6px 8px -6px rgba(0,0,0,0.7)"
                      : undefined,
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
                  noRealized={noRealized}
                  onDelete={() => setConfirming(e)}
                  onEdit={e.id ? () => setEditing(e) : undefined}
                  flash={!!flashTransferId && e.transferId === flashTransferId}
                  onOpenLinked={
                    onOpenLinked &&
                    e.counterpartyHoldingId &&
                    e.transferId &&
                    canOpen?.(e.counterpartyHoldingId)
                      ? () =>
                          onOpenLinked(e.counterpartyHoldingId!, e.transferId!)
                      : undefined
                  }
                />
              );
            })}
        <EntryEditDialog
          entry={editing}
          onOpenChange={(o) => !o && setEditing(null)}
          onSave={(body) => {
            if (editing?.id) editMut.mutate({ entryId: editing.id, body });
            setEditing(null);
          }}
        />
        <LedgerDeleteConfirm
          entry={confirming}
          assetName={assetName}
          kind={confirming ? t(kindKey(confirming)) : ""}
          date={confirming ? ledgerDate(confirming.effectiveDate, locale) : ""}
          interestAfter={
            !!confirming &&
            (entries ?? []).some(
              (x) =>
                x.kind === "interest" &&
                x.effectiveDate >= confirming.effectiveDate,
            )
          }
          onOpenChange={(o) => !o && setConfirming(null)}
          onConfirm={() => {
            if (confirming?.id) deleteMut.mutate({ entryId: confirming.id });
            setConfirming(null);
          }}
        />
      </div>
    </SlideCollapse>
  );
}
