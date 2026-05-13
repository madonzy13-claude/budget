"use client";
/**
 * draft-row.tsx — Pending recurring draft row.
 *
 * D-PH4-R1: background --surface-elevated-dark + 3px dashed --primary left border.
 * D-PH4-R2: Single click reveals [Confirm][Edit][Dismiss]. Double-click = edit-and-promote.
 * D-PH4-INT5: Enter after inline edit calls useConfirmDraft with amountOverride.
 * NO hover/onMouseEnter (D-PH4-INT1).
 */
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Pencil } from "lucide-react";
import { useRevealActions } from "./reveal-actions";
import { useConfirmDraft } from "@/hooks/use-confirm-draft";
import { useDismissDraft } from "@/hooks/use-dismiss-draft";
import { centsToDisplay } from "@/lib/cents-format";
import { parseDecimal } from "@/lib/decimal";
import { cn } from "@/lib/utils";

export interface DraftRowProps {
  draft: {
    id: string;
    amountConvertedCents: string;
    currencyConverted: string;
    ruleName: string;
    note?: string | null;
  };
  budgetId: string;
  month: string;
  onEdit: (draftId: string) => void;
}

export function DraftRow({ draft, budgetId, month, onEdit }: DraftRowProps) {
  const t = useTranslations("grid.draft");
  const locale = useLocale();
  const { revealed, setRevealed, ref } = useRevealActions();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const confirmMutation = useConfirmDraft(budgetId, month);
  const dismissMutation = useDismissDraft(budgetId, month);

  const formattedAmount = centsToDisplay(
    draft.amountConvertedCents,
    draft.currencyConverted,
    locale,
  );

  function handleClick() {
    setRevealed(!revealed);
  }

  function handleDoubleClick(e: React.MouseEvent) {
    e.stopPropagation();
    setEditValue((parseInt(draft.amountConvertedCents, 10) / 100).toString());
    setEditing(true);
    setRevealed(false);
  }

  function handleEditKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      const cents = parseDecimal(editValue);
      const mutateInput: import("@/hooks/use-confirm-draft").ConfirmDraftInput =
        cents !== null
          ? { draftId: draft.id, amountOverride: cents }
          : { draftId: draft.id };
      confirmMutation.mutate(mutateInput);
      setEditing(false);
    }
    if (e.key === "Escape") {
      setEditing(false);
    }
  }

  return (
    <div
      ref={ref}
      data-testid={`draft-row-${draft.ruleName.toLowerCase()}`}
      onClick={handleClick}
      role="row"
      tabIndex={0}
      style={{ borderLeft: "3px dashed var(--primary)" }}
      className={cn(
        "flex min-h-[40px] items-center gap-2 px-3 py-1",
        "cursor-pointer select-none bg-[var(--surface-elevated-dark)]",
      )}
    >
      {/* Amount + ruleName */}
      <div className="flex-1" onDoubleClick={handleDoubleClick}>
        {editing ? (
          <input
            type="text"
            inputMode="decimal"
            autoFocus
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleEditKeyDown}
            className="w-full rounded border border-[var(--primary)] bg-transparent px-2 py-0.5 text-sm"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="text-sm text-[var(--body-on-dark)]">
            {formattedAmount}
            <span className="ml-2 text-xs text-[var(--muted-foreground)]">
              {draft.ruleName}
            </span>
          </span>
        )}
      </div>

      {/* Action chips — only shown on single click, NEVER on hover */}
      {revealed && !editing && (
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-testid="draft-action-confirm"
            onClick={(e) => {
              e.stopPropagation();
              confirmMutation.mutate({ draftId: draft.id });
              setRevealed(false);
            }}
            className="rounded bg-[var(--primary)] px-3 py-1 text-xs font-semibold text-[var(--on-primary)]"
          >
            {t("action.confirm")}
          </button>
          <button
            type="button"
            data-testid="draft-action-edit"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(draft.id);
              setRevealed(false);
            }}
            className="flex h-7 w-7 items-center justify-center rounded hover:bg-[var(--surface-card-dark)]"
          >
            <Pencil
              className="h-4 w-4 text-[var(--body-on-dark)]"
              aria-hidden="true"
            />
          </button>
          <button
            type="button"
            data-testid="draft-action-dismiss"
            onClick={(e) => {
              e.stopPropagation();
              dismissMutation.mutate(draft.id);
              setRevealed(false);
            }}
            className="rounded px-2 py-1 text-xs text-[var(--muted-foreground)] hover:bg-[var(--surface-card-dark)]"
          >
            {t("action.dismiss")}
          </button>
        </div>
      )}
    </div>
  );
}
