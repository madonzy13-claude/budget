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
import { Check } from "lucide-react";
import { toast } from "sonner";
import { parseDecimal } from "@/lib/decimal";
import { useCreateTransaction } from "@/hooks/use-create-transaction";

export interface QuickEntryInputProps {
  categoryId: string;
  categoryName: string;
  budgetId: string;
  month: string; // YYYY-MM viewed
  budgetCurrency: string;
  resolvedDate: string; // ISO YYYY-MM-DD — passed in, computed by parent
  /**
   * 260615-bse: invoked when an add is attempted while offline — the grid hosts
   * a single shared dialog and opens it here. Two paths converge on this:
   *  1. device-knows-offline (navigator.onLine===false) → short-circuit BEFORE
   *     mutate so NO optimistic row is inserted (no add-then-remove flicker);
   *  2. lying-true (onLine reports true on a dead link) → wired as the hook's
   *     onOfflineError so the same dialog opens after the optimistic rollback.
   */
  onOfflineAttempt: () => void;
}

export function QuickEntryInput({
  categoryId,
  categoryName,
  budgetId,
  month,
  budgetCurrency,
  resolvedDate,
  onOfflineAttempt,
}: QuickEntryInputProps) {
  const t = useTranslations("grid.quickEntry");
  const tError = useTranslations("grid.error");
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  // Lying-true case: an OfflineWriteError (timeout / dead link with onLine===true)
  // opens the SAME dialog as the pre-insert path after rolling back.
  const { mutate } = useCreateTransaction(budgetId, month, {
    onOfflineError: onOfflineAttempt,
  });

  // silent = blur path: don't toast on an invalid value, just leave it.
  function submit(silent = false) {
    if (!value.trim()) return;
    const cents = parseDecimal(value);
    if (cents === null) {
      if (!silent) toast.error(tError("quickEntry"));
      return;
    }
    // D-PH4-Q1: clear input first, then optimistic insert
    setValue("");
    // 260615-bse: device-knows-offline → pop the dialog and DO NOT mutate, so
    // onMutate never runs → no optimistic row → no add-then-remove flicker.
    // (navigator.onLine===false is the only reliable signal on iOS; the `true`
    // value lies on a dead link — that case is caught by onOfflineError above.)
    if (navigator.onLine === false) {
      onOfflineAttempt();
      return;
    }
    mutate({
      categoryId,
      amountCents: cents,
      date: resolvedDate,
      currency: budgetCurrency,
      note: null,
    });
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setValue("");
      return;
    }
    if (e.key === "Enter") submit();
  }

  const testId = `quick-entry-${categoryName.toLowerCase()}`;

  return (
    <div
      // touch-action: pan-x — keep the quick-entry slot from scrolling the
      // grid vertically when the finger lands on it. iOS Safari sometimes
      // honors touch-action on text inputs poorly, so set it explicitly on
      // both the wrapper and the input element.
      style={{ touchAction: "pan-x" }}
      className="border-t border-[var(--hairline-dark)] px-2 py-1.5"
    >
      <p className="mb-1 text-[10px] text-[var(--muted-foreground)]">
        {t("title")}
      </p>
      <div className="relative">
      <input
        ref={inputRef}
        data-testid={testId}
        // Opt OUT of the global offline read-only block: quick-entry owns its
        // own richer "Can't add while offline" dialog (see submit()).
        data-offline-ok
        type="text"
        inputMode="decimal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => submit(true)}
        placeholder={t("placeholder")}
        aria-label={t("addExpenseAria", { categoryName })}
        style={{ touchAction: "pan-x" }}
        className="h-9 w-full appearance-none rounded border border-[var(--hairline-dark)] bg-transparent px-3 pr-9 text-base sm:text-sm text-[var(--body-on-dark)] placeholder:text-[var(--muted-foreground)] [-webkit-tap-highlight-color:transparent] focus:border-[var(--primary)] focus:outline-none focus:shadow-none focus:ring-0 !cursor-pointer focus:!cursor-text"
      />
      {/* r39 chaining: iOS can't re-show a keyboard after the system Done key
          dismisses it (programmatic focus is not a page gesture). This in-page
          save button preventDefaults its pointerdown so the input NEVER blurs
          — the keyboard stays open and the next amount can be typed
          immediately. Rendered only while there's something to save. */}
      {value.trim() !== "" && (
        <button
          type="button"
          data-testid={`${testId}-next`}
          aria-label={t("saveNextAria", { categoryName })}
          onPointerDown={(e) => e.preventDefault()}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => submit()}
          // Same checkmark anatomy as the draft-row confirm action: bare
          // yellow icon, no fill, hover surface only.
          className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded text-[var(--primary)] hover:bg-[var(--surface-card-dark)]"
        >
          <Check className="h-5 w-5" aria-hidden="true" strokeWidth={3} />
        </button>
      )}
      </div>
    </div>
  );
}
