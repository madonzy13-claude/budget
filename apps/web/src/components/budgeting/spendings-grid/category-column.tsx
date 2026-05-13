"use client";
/**
 * category-column.tsx — Sortable category column wrapping ColumnHeader + rows + QuickEntryInput.
 *
 * D-PH4-D3: GripVertical touch-none; drag listeners scoped to grip only.
 * Sortable via @dnd-kit/sortable useSortable.
 */
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ColumnHeader } from "./column-header";
import { TransactionRow } from "./transaction-row";
import { DraftRow } from "./draft-row";
import { QuickEntryInput } from "./quick-entry-input";
import type { TxnDTO } from "@/hooks/use-transactions";
import type { DraftDTO } from "@/hooks/use-drafts";

export interface SpendingsSummaryCategoryDTO {
  categoryId: string;
  name: string;
  iconKey: string | null;
  colorKey: string | null;
  sortIndex: number;
  plannedCents: string;
  cushionCents: string;
  activeBudgetCents: string;
  spentCents: string;
  reserveUsedCents: string;
  overspentCents: string;
  balanceCents: string;
}

export interface CategoryColumnProps {
  category: {
    id: string;
    name: string;
    iconKey: string | null;
    colorKey: string | null;
    sortIndex: number;
  };
  summary: SpendingsSummaryCategoryDTO;
  cushionModeEnabled: boolean;
  budgetCurrency: string;
  transactions: TxnDTO[];
  drafts: DraftDTO[];
  budgetId: string;
  month: string;
  isPastMonth: boolean;
  resolvedQuickEntryDate: string;
  onEditTxn: (txId: string) => void;
  onEditDraft: (draftId: string) => void;
  onEditCategory: (categoryId: string) => void;
}

export function CategoryColumn({
  category,
  summary,
  cushionModeEnabled,
  budgetCurrency,
  transactions,
  drafts,
  budgetId,
  month,
  isPastMonth,
  resolvedQuickEntryDate,
  onEditTxn,
  onEditDraft,
  onEditCategory,
}: CategoryColumnProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-testid={`category-column-${category.id}`}
      {...attributes}
      className="w-[140px] sm:w-[160px] flex flex-col flex-shrink-0 rounded-[var(--radius-lg)] bg-[var(--surface-card-dark)] outline outline-1 outline-[var(--border)]"
    >
      <ColumnHeader
        category={category}
        summary={summary}
        cushionModeEnabled={cushionModeEnabled}
        budgetCurrency={budgetCurrency}
        dragGripProps={listeners ?? {}}
        onEdit={onEditCategory}
      />

      <div className="flex flex-col gap-[var(--spacing-xs)] flex-1">
        {drafts.map((d) => (
          <DraftRow
            key={d.id}
            draft={d}
            budgetId={budgetId}
            month={month}
            onEdit={onEditDraft}
          />
        ))}
        {transactions.map((t) => (
          <TransactionRow
            key={t.id}
            txn={t}
            budgetId={budgetId}
            month={month}
            onEdit={onEditTxn}
          />
        ))}
      </div>

      <QuickEntryInput
        categoryId={category.id}
        categoryName={category.name}
        budgetId={budgetId}
        month={month}
        budgetCurrency={budgetCurrency}
        isPastMonth={isPastMonth}
        resolvedDate={resolvedQuickEntryDate}
      />
    </div>
  );
}
