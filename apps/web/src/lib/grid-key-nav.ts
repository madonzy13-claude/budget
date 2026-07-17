/**
 * grid-key-nav.ts — desktop keyboard navigation for the spendings grid (r40b).
 *
 * Entry: with nothing relevant focused (page just loaded, focus on <body>), ANY
 * arrow focuses the FIRST category's quick input.
 *
 * Vertical (ArrowUp/Down) is a CYCLE within a column over [row0 … rowN, quick
 * input] — the quick input sits below the rows, so it wraps in one continuous
 * loop: quick input + Up → bottom row, bottom row + Down → quick input, top row
 * + Up → quick input, quick input + Down → top row.
 *   • Cmd/Ctrl+Up   → jump to the quick input (the entry field).
 *   • Cmd/Ctrl+Down → jump to the BOTTOM transaction.
 *
 * Horizontal (ArrowLeft/Right) on a ROW hops to the SAME row index in the
 * adjacent column (clamped to that column's LAST row, or its quick input when
 * it has none).
 *   • Cmd/Ctrl+Left/Right → jump to the FIRST / LAST column (same row rules).
 *   • Cmd/Ctrl+Shift+Left/Right → NOT handled here; the MonthNavigator owns it
 *     (prev / next month), so we return false and let that window listener run.
 * On a QUICK INPUT, Left/Right are NOT handled here — the input owns its caret
 * and does its own edge-hop. Arrows never hijack the inline amount editor.
 *
 * Pure DOM helper so it unit-tests without mounting the grid; the grid
 * container calls it from onKeyDown and preventDefaults when it returns true.
 */

const QUICK_INPUTS = 'input[data-testid^="quick-entry-"]';
const ROWS = "[data-txn-nav]";
const COLUMN = '[data-testid^="category-column-"]';
const ARROWS = ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"];
const MENU_LIKE = '[role="menu"],[role="listbox"],[role="dialog"]';

/**
 * Should the document-level grid key listener act on a key, given what's focused?
 *
 * The listener is capture-phase on `document`, so it sees keys before anything
 * else. It must claim arrows / type-ahead when focus is "nowhere relevant" —
 * `<body>`, or a BDP tab pill that KEPT focus after a pushState tab switch (the
 * bug where arrows did nothing until you first clicked the page) — and when
 * focus is already inside the grid. It must NOT steal keys from a text field or
 * an open menu / listbox / dialog / popover, which own their own arrow handling.
 */
export function isGridNavEligibleTarget(
  target: EventTarget | null,
  root: HTMLElement,
): boolean {
  if (!target) return true; // nothing focused → enter the grid
  const el = target as HTMLElement;
  if (root.contains(el)) return true; // already inside the grid
  if (
    el.tagName === "INPUT" ||
    el.tagName === "TEXTAREA" ||
    el.tagName === "SELECT" ||
    el.isContentEditable
  )
    return false; // a real text field elsewhere — leave it alone
  if (el.closest?.(MENU_LIKE)) return false; // open menu/dialog owns its keys
  return true; // a plain non-editable element (body, a lingering nav pill…)
}

interface KeyLike {
  key: string;
  shiftKey: boolean;
  metaKey?: boolean;
  ctrlKey?: boolean;
  target: EventTarget | null;
}

export function handleGridKeyNav(e: KeyLike, root: HTMLElement): boolean {
  if (!ARROWS.includes(e.key)) return false;
  const mod = !!(e.metaKey || e.ctrlKey);
  const horizontal = e.key === "ArrowLeft" || e.key === "ArrowRight";

  // Cmd/Ctrl+Shift+Left/Right belongs to the MonthNavigator (prev/next month).
  if (mod && e.shiftKey && horizontal) return false;

  const target = e.target as HTMLElement | null;
  const isRow = !!target?.matches?.(ROWS);
  const isQuickInput = !!target?.matches?.(QUICK_INPUTS);
  const column = target?.closest<HTMLElement>(COLUMN) ?? null;
  // A text editor that is NEITHER a nav row NOR a quick input == the inline
  // amount editor — arrows keep their native caret behaviour there.
  const inEditor =
    !!target &&
    !isRow &&
    !isQuickInput &&
    !!target.matches?.("input, textarea, select, [contenteditable]");
  if (inEditor) return false;

  // Entry point: nothing relevant focused → first quick input, for ANY arrow.
  if (!column && !isRow && !isQuickInput) {
    const firstQi = root.querySelector<HTMLElement>(QUICK_INPUTS);
    if (!firstQi) return false;
    firstQi.focus();
    return true;
  }

  if (horizontal) {
    // Only a focused ROW hops columns; a quick input keeps its own caret/edge-hop.
    if (!isRow || !column) return false;

    const columns = Array.from(root.querySelectorAll<HTMLElement>(COLUMN));
    const curIdx = columns.indexOf(column);
    const goRight = e.key === "ArrowRight";
    // Cmd/Ctrl jumps to the FIRST / LAST column; a plain arrow moves one column
    // over and WRAPS at the edges (left of the first → last, right of last → first).
    const targetIdx = mod
      ? goRight
        ? columns.length - 1
        : 0
      : (curIdx + (goRight ? 1 : -1) + columns.length) % columns.length;
    const nextCol = columns[targetIdx];
    if (!nextCol || nextCol === column) return false; // single column → no move

    const rowIdx = Array.from(
      column.querySelectorAll<HTMLElement>(ROWS),
    ).indexOf(target!);
    const nextRows = Array.from(nextCol.querySelectorAll<HTMLElement>(ROWS));
    if (nextRows.length === 0) {
      const qi = nextCol.querySelector<HTMLElement>(QUICK_INPUTS);
      if (!qi) return false;
      qi.focus();
      return true;
    }
    nextRows[Math.min(rowIdx, nextRows.length - 1)]!.focus();
    return true;
  }

  // ArrowUp / ArrowDown.
  const col = column ?? root.querySelector<HTMLElement>(COLUMN);
  if (!col) return false;
  const rows = Array.from(col.querySelectorAll<HTMLElement>(ROWS));
  const qi = col.querySelector<HTMLElement>(QUICK_INPUTS);

  if (mod) {
    // Jump to the ends: Up → the quick input (entry field); Down → bottom row.
    if (e.key === "ArrowUp") {
      if (!qi) return false;
      qi.focus();
      return true;
    }
    if (rows.length === 0) {
      if (!qi) return false;
      qi.focus();
      return true;
    }
    rows[rows.length - 1]!.focus();
    return true;
  }

  // Plain Up/Down — cycle over [rows…, quick input] within the column.
  const cycle: HTMLElement[] = qi ? [...rows, qi] : rows;
  if (cycle.length === 0) return false;
  const idx = cycle.indexOf(target as HTMLElement);
  const from = idx === -1 ? (e.key === "ArrowDown" ? -1 : cycle.length) : idx;
  const dir = e.key === "ArrowDown" ? 1 : -1;
  cycle[(from + dir + cycle.length) % cycle.length]!.focus();
  return true;
}
