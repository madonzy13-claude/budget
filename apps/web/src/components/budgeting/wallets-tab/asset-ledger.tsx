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
}: AssetLedgerProps) {
  const t = useTranslations("budget.investments");
  const locale = useLocale();
  const { data: entries, isLoading } = useAssetEntries(budgetId, assetId, open);
  const deleteMut = useDeleteEntry(budgetId);
  const [confirming, setConfirming] = useState<EntryDto | null>(null);
  // Mounted from the first open on, so closing can slide shut.
  const [seen, setSeen] = useState(open);
  const stripRef = useRef<HTMLDivElement>(null);
  // After a jump from the partner: bring the matching row into view.
  useEffect(() => {
    if (!flashTransferId || !entries) return;
    stripRef.current
      ?.querySelector(`[data-transfer-id="${CSS.escape(flashTransferId)}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  }, [flashTransferId, entries]);
  if (open && !seen) setSeen(true);
  if (!seen) return null;

  return (
    <div
      data-ledger-slide
      aria-hidden={!open || undefined}
      inert={!open || undefined}
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
      className="grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"
    >
      {/* Vertical-only clip (round-2 gap 5): `clip` does not force the other
          axis to auto, so a swiped strip is never cut on the left. */}
      <div
        className="min-h-0"
        style={{ overflowY: "clip", overflowX: "visible" }}
      >
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
                    onDelete={() => setConfirming(e)}
                    flash={
                      !!flashTransferId && e.transferId === flashTransferId
                    }
                    onOpenLinked={
                      onOpenLinked &&
                      e.counterpartyHoldingId &&
                      e.transferId &&
                      canOpen?.(e.counterpartyHoldingId)
                        ? () =>
                            onOpenLinked(
                              e.counterpartyHoldingId!,
                              e.transferId!,
                            )
                        : undefined
                    }
                  />
                );
              })}
          <LedgerDeleteConfirm
            entry={confirming}
            assetName={assetName}
            kind={confirming ? t(kindKey(confirming)) : ""}
            date={
              confirming ? ledgerDate(confirming.effectiveDate, locale) : ""
            }
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
      </div>
    </div>
  );
}
