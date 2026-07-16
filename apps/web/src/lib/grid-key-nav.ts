/**
 * grid-key-nav.ts — desktop keyboard navigation for the spendings grid (r40).
 *
 * Tab / Shift+Tab cycle the per-category quick-add inputs (wrapping; FIRST /
 * LAST entry point when nothing relevant is focused) — including while a
 * transaction amount editor is active, per UAT. ArrowDown/ArrowUp walk the
 * focused column's transaction rows: Down enters at the TOP, Up enters at the
 * BOTTOM, Up from the first row returns to the column's quick input. Arrows
 * never hijack the caret inside a transaction amount editor.
 *
 * Pure DOM helper so it unit-tests without mounting the grid; the grid
 * container calls it from onKeyDown and preventDefaults when it returns true.
 */

const QUICK_INPUTS = 'input[data-testid^="quick-entry-"]';
const ROWS = "[data-txn-nav]";
const COLUMN = '[data-testid^="category-column-"]';

interface KeyLike {
  key: string;
  shiftKey: boolean;
  target: EventTarget | null;
}

export function handleGridKeyNav(e: KeyLike, root: HTMLElement): boolean {
  const target = e.target as HTMLElement | null;

  if (e.key === "Tab") {
    const inputs = Array.from(root.querySelectorAll<HTMLElement>(QUICK_INPUTS));
    if (inputs.length === 0) return false;
    const column = target?.closest<HTMLElement>(COLUMN) ?? null;
    // Current position: the focused quick input, or the column the focused
    // row / editor lives in.
    const current = column
      ? inputs.findIndex((i) => column.contains(i))
      : inputs.findIndex((i) => i === target);
    const dir = e.shiftKey ? -1 : 1;
    const next =
      current === -1
        ? e.shiftKey
          ? inputs.length - 1
          : 0
        : (current + dir + inputs.length) % inputs.length;
    inputs[next].focus();
    return true;
  }

  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    // Never steal the caret from a text editor that is NOT a quick input
    // (e.g. the transaction amount editor).
    const isQuickInput = !!target?.matches?.(QUICK_INPUTS);
    const isRow = !!target?.matches?.(ROWS);
    if (
      target &&
      !isQuickInput &&
      !isRow &&
      target.matches?.("input, textarea, select, [contenteditable]")
    ) {
      return false;
    }

    const column =
      target?.closest<HTMLElement>(COLUMN) ??
      root.querySelector<HTMLElement>(COLUMN);
    if (!column) return false;
    const rows = Array.from(column.querySelectorAll<HTMLElement>(ROWS));
    if (rows.length === 0) return false;

    if (isRow) {
      const idx = rows.indexOf(target as HTMLElement);
      if (e.key === "ArrowDown") {
        rows[Math.min(idx + 1, rows.length - 1)].focus();
      } else if (idx === 0) {
        column.querySelector<HTMLElement>(QUICK_INPUTS)?.focus();
      } else {
        rows[idx - 1].focus();
      }
      return true;
    }
    // Entering the list from the quick input (or from nowhere).
    (e.key === "ArrowDown" ? rows[0] : rows[rows.length - 1]).focus();
    return true;
  }

  return false;
}
