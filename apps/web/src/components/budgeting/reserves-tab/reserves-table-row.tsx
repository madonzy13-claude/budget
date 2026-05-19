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
import { centsToBare } from "@/lib/cents-format";
import type { ReservesSummaryRow } from "@/hooks/use-reserves-summary";

export interface ReservesTableRowProps {
  row: ReservesSummaryRow;
  currency: string;
  isExcluded: boolean;
  onUpdate: (newCents: bigint) => Promise<void>;
}

export function ReservesTableRow({
  row,
  isExcluded,
  onUpdate,
}: ReservesTableRowProps) {
  const { attributes, listeners, setNodeRef, transform } = useDraggable({
    id: row.categoryId,
  });

  const sharePct = row.walletSharePercent;

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
      <div className="min-w-0 flex-1 truncate text-sm text-[var(--foreground)]">
        {row.name}
      </div>

      {/* Reserve balance ("Expected") — editable on Active, read-only
          (grayed) on Excluded (D-PH5-R10). UAT-PH5-T3-45: bare number
          formatting (centsToBare) to match wallets. T3-52: shrunk
          mobile width to 72 px so the Actual column fits alongside. */}
      <div className="w-[72px] text-right tabular-nums sm:w-[120px]">
        <InlineEditCell
          value={row.reserveBalanceCents}
          ariaLabel={`Reserve balance for ${row.name}`}
          disabled={isExcluded}
          testId={`reserves-balance-${row.categoryId}`}
          render={(v) => (
            <span
              className={`text-num-md ${isExcluded ? "text-[var(--muted-strong)]" : "text-[var(--foreground)]"}`}
            >
              {centsToBare(v)}
            </span>
          )}
          renderEditor={(draft, onChange, _onCommit, onCancel) => (
            <Input
              autoFocus
              type="text"
              inputMode="decimal"
              defaultValue={centsToBare(draft).replace(/[^0-9.-]/g, "")}
              onChange={(e) => onChange(e.target.value.replace(",", "."))}
              onKeyDown={(e) => {
                if (e.key === "Escape") onCancel();
                if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              }}
              className="h-9 text-right"
            />
          )}
          onSave={async (v) => {
            const cleaned = String(v).replace(",", ".");
            const n = Number(cleaned || "0");
            const cents = BigInt(
              Math.round((Number.isFinite(n) ? n : 0) * 100),
            );
            await onUpdate(cents);
          }}
        />
      </div>

      {/* Wallet share ("Actual") — em-dash when null OR excluded
          (D-PH5-R4). UAT-PH5-T3-50: the amount turns red when this
          category's reserve balance exceeds the wallet share allocated
          to it. T3-52: visible on mobile (88 px) so user can see what
          fraction of the wallet pool actually backs each row. */}
      <div className="w-[88px] text-right text-num-md sm:w-[160px]">
        {sharePct === null || isExcluded ? (
          <span
            className="text-[var(--muted-foreground)]"
            aria-label="No share"
          >
            —
          </span>
        ) : (
          (() => {
            const balanceCents = BigInt(row.reserveBalanceCents);
            const shareCents = BigInt(row.walletShareAmountCents!);
            const underfunded = balanceCents > shareCents;
            return (
              <span>
                <span
                  className={
                    underfunded ? "text-[var(--destructive)]" : undefined
                  }
                >
                  {centsToBare(row.walletShareAmountCents!)}
                </span>{" "}
                <span className="text-num-sm text-[var(--muted-foreground)]">
                  ({sharePct.toFixed(0)}%)
                </span>
              </span>
            );
          })()
        )}
      </div>

      {/* Actions placeholder — hidden on mobile (T3-45). */}
      <div
        className="hidden sm:block sm:w-[80px] text-center"
        aria-hidden="true"
      >
        <MoreHorizontal className="mx-auto h-4 w-4 text-[var(--muted-strong)]" />
      </div>
    </div>
  );
}
