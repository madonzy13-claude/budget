"use client";
/**
 * draft-row.tsx — Pending recurring draft row.
 *
 * D-PH4-R1: background --surface-elevated-dark + 3px dashed --primary left border.
 * D-PH4-R2: Tap reveals [Confirm][Edit][Dismiss] on touch. Double-click = edit-and-promote.
 * D-PH4-INT5: Enter after inline edit calls useConfirmDraft with amountOverride.
 * Desktop: the action chips also reveal on HOVER (group-hover) — tap-reveal is
 * kept for touch where there is no hover.
 */
import { useRef, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { Pencil, Check, Trash2 } from "lucide-react";
import { useRevealActions } from "./reveal-actions";
import { useConfirmDraft } from "@/hooks/use-confirm-draft";
import { useDismissDraft } from "@/hooks/use-dismiss-draft";
import { centsToBare } from "@/lib/cents-format";
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
  /** Inset top shadow — used on the first draft so the draft section reads
   *  as if it sits "underneath" the confirmed group. */
  topShadow?: boolean;
  /** Archived (keep-history) column → locked: no reveal, no confirm/edit/dismiss. */
  readOnly?: boolean;
}

export function DraftRow({
  draft,
  budgetId,
  month,
  onEdit,
  topShadow,
  readOnly = false,
}: DraftRowProps) {
  const t = useTranslations("grid.draft");
  const locale = useLocale();
  const { revealed, setRevealed, ref } = useRevealActions();
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");

  const confirmMutation = useConfirmDraft(budgetId, month);
  const dismissMutation = useDismissDraft(budgetId, month);
  // Tracks "Escape was pressed" so the trailing onBlur skips committing.
  const cancelledRef = useRef(false);
  // Tracks "edit was just committed" so onBlur doesn't fire a second mutation.
  const committedRef = useRef(false);

  const formattedAmount = centsToBare(draft.amountConvertedCents, locale);
  // A recurring rule's note usually defaults to its name, so the row would render
  // the same label twice (e.g. "T-Mobile  T-Mobile"). Only show the note when it
  // adds something beyond the rule name.
  const noteDiffers =
    !!draft.note &&
    draft.note.trim().toLowerCase() !==
      (draft.ruleName ?? "").trim().toLowerCase();

  function handleClick() {
    if (readOnly) return;
    setRevealed(!revealed);
  }

  function handleDoubleClick(e: React.MouseEvent) {
    if (readOnly) return;
    e.stopPropagation();
    setEditValue((parseInt(draft.amountConvertedCents, 10) / 100).toString());
    cancelledRef.current = false;
    committedRef.current = false;
    setEditing(true);
    setRevealed(false);
  }

  function commitEdit() {
    if (committedRef.current) return;
    const cents = parseDecimal(editValue);
    // Unchanged value = no-op: closing the editor is the only action. The
    // draft stays pending until the user actually changes the amount or
    // clicks Confirm directly.
    if (cents === null || cents === parseInt(draft.amountConvertedCents, 10)) {
      setEditing(false);
      return;
    }
    committedRef.current = true;
    confirmMutation.mutate({ draftId: draft.id, amountOverride: cents });
    setEditing(false);
  }

  function handleEditKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitEdit();
    }
    if (e.key === "Escape") {
      cancelledRef.current = true;
      setEditing(false);
    }
  }

  function handleEditBlur() {
    if (cancelledRef.current || committedRef.current) return;
    commitEdit();
  }

  return (
    <div
      ref={ref}
      data-testid={`draft-row-${draft.ruleName.toLowerCase()}`}
      onClick={handleClick}
      role="row"
      tabIndex={0}
      style={{
        // Theme-aware sunken lane (was hardcoded #181c22 → stayed dark in light
        // theme, round 18 item 8). --surface-sunken-dark flips to #e7eaef in light.
        backgroundColor: "var(--surface-sunken-dark)",
        boxShadow: topShadow
          ? "inset 0 6px 8px -6px rgba(0,0,0,0.7)"
          : undefined,
      }}
      className={cn(
        "group flex min-h-[40px] items-center gap-1 px-2 py-1",
        // Draft bg sits a step darker than the column (#1e2329) — row reads as
        // "tentative / not yet confirmed" without competing with confirmed rows.
        "cursor-pointer select-none text-[var(--muted-foreground)]",
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
            onBlur={handleEditBlur}
            className="w-full rounded border border-[var(--primary)] bg-transparent px-2 py-0.5 text-sm"
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <span className="flex min-w-0 items-baseline gap-2 text-sm text-[var(--muted-foreground)]">
            <span className="shrink-0">{formattedAmount}</span>
            {/* note + ruleName hide once the action chips show (tap-revealed OR
                desktop hover) so all three chips fit without clipping. The note is
                skipped when it merely repeats the rule name (no duplicate label). */}
            {noteDiffers && !revealed ? (
              <span
                data-testid="draft-row-note"
                className="min-w-0 truncate text-xs text-[var(--muted-foreground)] sm:group-hover:hidden"
              >
                {draft.note}
              </span>
            ) : null}
            {draft.ruleName ? (
              <span
                className={cn(
                  "shrink-0 text-xs text-[var(--muted-foreground)] sm:group-hover:hidden",
                  revealed && "hidden",
                )}
              >
                {draft.ruleName}
              </span>
            ) : null}
          </span>
        )}
      </div>

      {/* Action chips — icon-only so all three fit inside the narrow column.
          Hidden until tap-reveal (touch) or hover (desktop, sm:group-hover).
          Archived (readOnly) columns never reveal them. */}
      {!editing && !readOnly && (
        <div
          className={cn(
            "shrink-0 items-center gap-0.5",
            revealed ? "flex" : "hidden",
            "sm:group-hover:flex",
          )}
        >
          <button
            type="button"
            data-testid="draft-action-confirm"
            aria-label={t("action.confirm")}
            title={t("action.confirm")}
            onClick={(e) => {
              e.stopPropagation();
              confirmMutation.mutate({ draftId: draft.id });
              setRevealed(false);
            }}
            className="flex h-7 w-7 items-center justify-center rounded text-[var(--primary)] hover:bg-[var(--surface-card-dark)]"
          >
            <Check className="h-5 w-5" aria-hidden="true" strokeWidth={3} />
          </button>
          <button
            type="button"
            data-testid="draft-action-edit"
            aria-label={t("action.edit")}
            title={t("action.edit")}
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
            aria-label={t("action.dismiss")}
            title={t("action.dismiss")}
            onClick={(e) => {
              e.stopPropagation();
              dismissMutation.mutate(draft.id);
              setRevealed(false);
            }}
            className="flex h-7 w-7 items-center justify-center rounded text-[var(--destructive)] hover:bg-[var(--surface-card-dark)]"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </div>
  );
}
