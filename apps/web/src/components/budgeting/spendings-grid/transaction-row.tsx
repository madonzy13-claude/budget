"use client";
/**
 * transaction-row.tsx — Confirmed transaction row with single-click reveal.
 *
 * D-PH4-INT1: Single click reveals [Pen][Trash]. NO hover/onMouseEnter.
 * D-PH4-INT2: Double-click on amount = inline edit. Enter = PATCH. Esc = revert.
 * D-PH4-Q1: pending/unsent flags show spinner/retry states.
 * T-04-03-05: no onMouseEnter anywhere in this file.
 */
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Pencil, Trash2, Loader2, RotateCcw } from "lucide-react";
import { useRevealActions } from "./reveal-actions";
import { useDeleteTransaction } from "@/hooks/use-delete-transaction";
import { useUpdateTransaction } from "@/hooks/use-update-transaction";
import { centsToDisplay } from "@/lib/cents-format";
import { parseDecimal } from "@/lib/decimal";
import { cn } from "@/lib/utils";

export interface TransactionRowProps {
  txn: {
    id: string;
    amountConvertedCents: string;
    currencyConverted: string;
    amountOriginalCents?: string;
    currencyOriginal?: string;
    fxRate?: string;
    fxAsOf?: string;
    note?: string | null;
    pending?: boolean;
    unsent?: boolean;
  };
  budgetId: string;
  month: string;
  onEdit: (txnId: string) => void;
  onRetry?: (txnId: string) => void;
}

export function TransactionRow({
  txn,
  budgetId,
  month,
  onEdit,
  onRetry,
}: TransactionRowProps) {
  const t = useTranslations("grid.txn");
  const locale = useLocale();
  const { revealed, setRevealed, ref } = useRevealActions();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const deleteMutation = useDeleteTransaction(budgetId, month);
  const updateMutation = useUpdateTransaction(budgetId, month);

  const formattedAmount = centsToDisplay(
    txn.amountConvertedCents,
    txn.currencyConverted,
    locale,
  );

  function handleClick() {
    if (txn.unsent && onRetry) {
      onRetry(txn.id);
      return;
    }
    setRevealed(!revealed);
  }

  function handleDoubleClick(e: React.MouseEvent) {
    e.stopPropagation();
    setEditValue(
      (parseInt(txn.amountConvertedCents, 10) / 100).toString(),
    );
    setEditing(true);
    setRevealed(false);
  }

  function commitEdit() {
    const cents = parseDecimal(editValue);
    if (cents !== null) {
      updateMutation.mutate({ txId: txn.id, amountCents: cents });
    }
    setEditing(false);
  }

  function handleEditKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
    if (e.key === "Escape") { setEditing(false); }
  }

  return (
    <div
      ref={ref}
      data-testid={`txn-row-${txn.amountConvertedCents}`}
      data-pending={txn.pending ? "true" : undefined}
      data-unsent={txn.unsent ? "true" : undefined}
      onClick={handleClick}
      role="row"
      tabIndex={0}
      className={cn(
        "flex min-h-[40px] items-center gap-2 px-3 py-1",
        "cursor-pointer select-none",
        revealed && "bg-[var(--surface-elevated-dark)]",
        txn.unsent && "ring-1 ring-[var(--destructive)]",
        txn.pending && "opacity-70",
      )}
    >
      {/* Amount cell */}
      <div className="flex-1" onDoubleClick={handleDoubleClick}>
        {editing ? (
          <input
            type="text"
            inputMode="decimal"
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleEditKeyDown}
            onBlur={commitEdit}
            className="w-full rounded border border-[var(--primary)] bg-transparent px-2 py-0.5 text-sm"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="text-sm text-[var(--body-on-dark)]">
            {txn.pending ? (
              <Loader2 className="inline h-4 w-4 animate-spin text-[var(--muted-foreground)]" />
            ) : txn.unsent ? (
              <RotateCcw className="inline h-4 w-4 text-[var(--destructive)]" />
            ) : null}
            {formattedAmount}
          </span>
        )}
      </div>

      {/* Action chips — only shown on single click, NEVER on hover */}
      {revealed && !editing && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="txn-action-edit"
            aria-label={t("action.delete")}
            onClick={(e) => {
              e.stopPropagation();
              onEdit(txn.id);
              setRevealed(false);
            }}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--surface-card-dark)]"
          >
            <Pencil className="h-4 w-4 text-[var(--body-on-dark)]" aria-hidden="true" />
          </button>
          <button
            type="button"
            data-testid="txn-action-delete"
            aria-label={t("action.delete")}
            onClick={(e) => {
              e.stopPropagation();
              deleteMutation.mutate(txn.id);
              setRevealed(false);
            }}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--surface-card-dark)]"
          >
            <Trash2 className="h-4 w-4 text-[var(--destructive)]" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
