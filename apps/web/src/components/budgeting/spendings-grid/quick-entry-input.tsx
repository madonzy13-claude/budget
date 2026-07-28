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
import { parseAmountAndNote } from "@/lib/decimal";
import { useCreateTransaction } from "@/hooks/use-create-transaction";
import { MobileKeyboardToggle } from "./mobile-keyboard-toggle";

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
  // 260722-d: numeric keyboard by default; the ABC/123 button flips it to text
  // so a note can be typed after the amount + a space.
  const [keyboardMode, setKeyboardMode] = useState<"numeric" | "text">(
    "numeric",
  );
  const [focused, setFocused] = useState(false);
  const switchingKeyboardRef = useRef(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // r40b: an edge-hop submits then moves focus, which fires onBlur synchronously
  // BEFORE the cleared value flushes — without this the blur would submit the
  // same (stale) value a second time and insert a duplicate row.
  const justEdgeSubmittedRef = useRef(false);
  // Lying-true case: an OfflineWriteError (timeout / dead link with onLine===true)
  // opens the SAME dialog as the pre-insert path after rolling back.
  const { mutate } = useCreateTransaction(budgetId, month, {
    onOfflineError: onOfflineAttempt,
  });

  // silent = blur path: don't toast on an invalid value, just leave it.
  function submit(silent = false) {
    if (!value.trim()) return;
    // 260722-note: "11.45" / "11,45" → amount; a SPACE ends the amount and
    // everything after it becomes the note ("11.45 lunch" → 1145 + "lunch").
    const parsed = parseAmountAndNote(value);
    if (parsed === null) {
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
      amountCents: parsed.cents,
      date: resolvedDate,
      currency: budgetCurrency,
      note: parsed.note,
    });
    // r40b (item 10): a new row inserts at the TOP of its column, which is
    // hidden when the grid is scrolled down. Snap the grid back to the top so
    // the just-added transaction is visible below the sticky entry band.
    inputRef.current
      ?.closest<HTMLElement>('[data-testid="spendings-grid"]')
      ?.scrollTo({ top: 0 });
  }

  /** All quick inputs in DOM (== column) order. */
  function allQuickInputs(): HTMLInputElement[] {
    return Array.from(
      document.querySelectorAll<HTMLInputElement>(
        'input[data-testid^="quick-entry-"]',
      ),
    );
  }

  /** Focus a quick input, placing the caret on the entering edge. */
  function focusQuickInput(
    target: HTMLInputElement | undefined,
    atEnd: boolean,
  ) {
    if (!target) return;
    target.focus();
    const caret = atEnd ? target.value.length : 0;
    try {
      target.setSelectionRange(caret, caret);
    } catch {
      /* number-like inputs may reject setSelectionRange — focus is enough */
    }
  }

  // r40b: hop to the adjacent column's quick input, WRAPPING at the grid edges
  // (right of the last → first, left of the first → last). Caret lands on the
  // entering edge so repeated edge-presses chain in one direction.
  function focusAdjacentQuickInput(dir: -1 | 1) {
    const all = allQuickInputs();
    const idx = all.indexOf(inputRef.current as HTMLInputElement);
    if (idx === -1) return;
    focusQuickInput(all[(idx + dir + all.length) % all.length], dir === -1);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setValue("");
      return;
    }
    if (e.key === "Enter") {
      submit();
      return;
    }
    // 260722-b: once the field holds a value, arrows only move the caret — they
    // must NOT save + hop columns. Only Enter or blur saves. An empty field
    // keeps the edge-hop nav below (empty is at both edges → an immediate hop).
    if (value.trim() !== "") return;
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;

    const input = e.currentTarget;
    const goRight = e.key === "ArrowRight";

    // Cmd/Ctrl+Left/Right → jump to the FIRST / LAST column's quick input,
    // saving the current entry on the way.
    if (e.metaKey || e.ctrlKey) {
      e.preventDefault();
      submit();
      justEdgeSubmittedRef.current = true;
      const all = allQuickInputs();
      focusQuickInput(goRight ? all[all.length - 1] : all[0], !goRight);
      return;
    }

    // Plain Left/Right move the caret normally UNTIL the field edge; AT the edge
    // they save the entry and hop to the neighbouring column (wrapping). An empty
    // field is at both edges at once, so the arrows just hop (submit no-ops).
    const len = input.value.length;
    const atEdge = goRight
      ? input.selectionStart === len && input.selectionEnd === len
      : input.selectionStart === 0 && input.selectionEnd === 0;
    if (atEdge) {
      e.preventDefault();
      submit();
      justEdgeSubmittedRef.current = true;
      focusAdjacentQuickInput(goRight ? 1 : -1);
    }
  }

  function handleBlur() {
    // 260722-d: a keyboard-switch blur (ABC/123 tap blurs then refocuses in the
    // same gesture) must NOT save — leave `focused` true so the toggle stays up.
    if (switchingKeyboardRef.current) {
      switchingKeyboardRef.current = false;
      return;
    }
    setFocused(false);
    // Skip the save the edge-hop already performed (its focus move fired this
    // blur synchronously, before the cleared value flushed).
    if (justEdgeSubmittedRef.current) {
      justEdgeSubmittedRef.current = false;
      return;
    }
    submit(true);
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
          inputMode={keyboardMode === "numeric" ? "decimal" : "text"}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => setFocused(true)}
          onBlur={handleBlur}
          placeholder={t("placeholder")}
          aria-label={t("addExpenseAria", { categoryName })}
          style={{ touchAction: "pan-x" }}
          className="h-9 w-full appearance-none rounded border border-[var(--hairline-dark)] bg-transparent px-3 text-base sm:text-sm text-[var(--body-on-dark)] placeholder:text-[var(--muted-foreground)] [-webkit-tap-highlight-color:transparent] focus:border-[var(--primary)] focus:outline-none focus:shadow-none focus:ring-0 !cursor-pointer focus:!cursor-text"
        />
        {focused && (
          <MobileKeyboardToggle
            inputRef={inputRef}
            mode={keyboardMode}
            onToggle={() =>
              setKeyboardMode((m) => (m === "numeric" ? "text" : "numeric"))
            }
            switchingRef={switchingKeyboardRef}
          />
        )}
        {/* r40: the in-field save-next (✓) button was removed at the user's
          request. Research verdict on keeping the keyboard across a save on
          iOS: impossible without an in-page control — focus() only shows the
          keyboard inside a page gesture call stack, the system Done key is
          not interceptable, blur is not cancelable, the decimal pad has no
          return key, and navigator.virtualKeyboard is Chromium-only. Desktop
          chains via Enter (focus is kept); mobile cross-category chaining
          works by tapping the next field directly (input→input focus keeps
          the keyboard; the blur saves the previous entry). */}
      </div>
    </div>
  );
}
