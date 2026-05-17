"use client";
/**
 * reserves-table-row.tsx — 4-cell row for the Reserves tab.
 *
 * T-05-05: InlineEditCell disabled={true} on Excluded rows — click is a no-op.
 * T-05-10: category name rendered as plain JSX text — React auto-escapes.
 * D-PH5-R4: em-dash logic — share column shows "—" when walletSharePercent===null OR isExcluded.
 * D-PH5-R10: Excluded rows render FROZEN REAL reserveBalanceCents from API (NOT zero, NOT em-dash).
 *
 * W-5 contract: data-category-id on every row for downstream plan consumers.
 */
import * as React from "react";
import { useDraggable } from "@dnd-kit/core";
import { MoreHorizontal } from "lucide-react";
import { InlineEditCell } from "@/components/common/inline-edit-cell";
import { RowDragHandle } from "@/components/common/row-drag-handle";
import { Input } from "@/components/ui/input";
import type { ReservesSummaryRow } from "@/hooks/use-reserves-summary";

export interface ReservesTableRowProps {
  row: ReservesSummaryRow;
  currency: string;
  isExcluded: boolean;
  onUpdate: (newCents: bigint) => Promise<void>;
}

export function ReservesTableRow({
  row,
  currency,
  isExcluded,
  onUpdate,
}: ReservesTableRowProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: row.categoryId,
  });

  const sharePct = row.walletSharePercent;
  const shareAmt =
    row.walletShareAmountCents !== null
      ? Number(row.walletShareAmountCents) / 100
      : null;

  const fmt = (n: number) =>
    new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      currencyDisplay: "code",
    }).format(n);

  const rowClass = [
    "flex min-h-[48px] items-center gap-3 rounded-[var(--radius-md)]",
    "bg-[var(--surface-card-dark)] px-3 sm:min-h-[48px] min-h-[56px]",
    isExcluded ? "opacity-50" : "hover:bg-[var(--surface-elevated-dark)]",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      ref={setNodeRef}
      data-testid={`reserves-row-${row.categoryId}`}
      data-category-id={row.categoryId}
      style={
        transform
          ? {
              transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`,
            }
          : undefined
      }
      className={rowClass}
    >
      <RowDragHandle
        name={row.name}
        listeners={listeners}
        attributes={attributes}
      />

      {/* Category name — plain JSX, React auto-escapes (T-05-10) */}
      <div className="flex-1 truncate text-sm text-[var(--foreground)]">
        {row.name}
      </div>

      {/* Reserve balance — editable on Active, read-only (grayed) on Excluded (D-PH5-R10) */}
      <div className="w-[160px] text-right">
        <InlineEditCell
          value={row.reserveBalanceCents}
          ariaLabel={`Reserve balance for ${row.name}`}
          disabled={isExcluded}
          testId={`reserves-balance-${row.categoryId}`}
          render={(v) => (
            <span
              className={`text-num-md ${isExcluded ? "text-[var(--muted-strong)]" : "text-[var(--foreground)]"}`}
            >
              {fmt(Number(v) / 100)}
            </span>
          )}
          renderEditor={(draft, onChange, onCommit, onCancel) => (
            <Input
              autoFocus
              type="text"
              inputMode="decimal"
              value={(Number(draft) / 100).toFixed(2)}
              onChange={(e) =>
                onChange(
                  String(Math.round(Number(e.target.value || "0") * 100)),
                )
              }
              onBlur={onCommit}
              onKeyDown={(e) => {
                if (e.key === "Escape") onCancel();
                if (e.key === "Enter") onCommit();
              }}
              className="h-9 text-right"
            />
          )}
          onSave={async (v) => {
            await onUpdate(BigInt(v));
          }}
        />
      </div>

      {/* Wallet share — em-dash when null OR excluded (D-PH5-R4) */}
      <div className="w-[200px] text-right text-num-md">
        {sharePct === null || isExcluded ? (
          <span
            className="text-[var(--muted-foreground)]"
            aria-label="No share"
          >
            —
          </span>
        ) : (
          <span>
            {fmt(shareAmt!)}{" "}
            <span className="text-num-sm text-[var(--muted-foreground)]">
              ({sharePct.toFixed(2)}%)
            </span>
          </span>
        )}
      </div>

      {/* Actions placeholder — Plan 07 will wire CTA */}
      <div className="w-[80px] text-center" aria-hidden="true">
        <MoreHorizontal className="mx-auto h-4 w-4 text-[var(--muted-strong)]" />
      </div>
    </div>
  );
}
