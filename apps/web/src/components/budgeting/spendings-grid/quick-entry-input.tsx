"use client";
/**
 * quick-entry-input.tsx — Per-column quick expense entry.
 *
 * D-PH4-Q1: Optimistic insert; clear on submit; unsent on error.
 * D-PH4-Q2: Accepts . and , decimal separators; inputMode=decimal for mobile.
 * D-PH4-Q5: Past months use resolvedDate prop (last-of-month from parent).
 * T-04-03-01: parseDecimal strips malformed input; shows error toast on null.
 *
 * NO hover behavior (D-PH4-INT1).
 */
import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { parseDecimal } from "@/lib/decimal";
import { useCreateTransaction } from "@/hooks/use-create-transaction";

export interface QuickEntryInputProps {
  categoryId: string;
  categoryName: string;
  budgetId: string;
  month: string; // YYYY-MM viewed
  budgetCurrency: string;
  isPastMonth: boolean;
  resolvedDate: string; // ISO YYYY-MM-DD — passed in, computed by parent
}

export function QuickEntryInput({
  categoryId,
  categoryName,
  budgetId,
  month,
  budgetCurrency,
  isPastMonth,
  resolvedDate,
}: QuickEntryInputProps) {
  const t = useTranslations("grid.quickEntry");
  const tError = useTranslations("grid.error");
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { mutate } = useCreateTransaction(budgetId, month);

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setValue("");
      return;
    }
    if (e.key === "Enter") {
      if (!value.trim()) return;
      const cents = parseDecimal(value);
      if (cents === null) {
        toast.error(tError("quickEntry"));
        return;
      }
      // D-PH4-Q1: clear input first, then optimistic insert
      setValue("");
      mutate({
        categoryId,
        amountCents: cents,
        date: resolvedDate,
        currency: budgetCurrency,
        note: null,
      });
    }
  }

  const testId = `quick-entry-${categoryName.toLowerCase()}`;

  return (
    <div className="px-2 py-1">
      <input
        ref={inputRef}
        data-testid={testId}
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={t("placeholder")}
        aria-label={`Add expense to ${categoryName}`}
        className="h-9 w-full rounded border border-[var(--hairline-dark)] bg-transparent px-3 text-sm text-[var(--body-on-dark)] placeholder:text-[var(--muted-foreground)] focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
      />
      {isPastMonth && (
        <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">
          {t("helper.past", { date: resolvedDate })}
        </p>
      )}
    </div>
  );
}
