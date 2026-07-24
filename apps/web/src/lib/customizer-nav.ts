/**
 * customizer-nav.ts — pure keyboard-grid math for the WalletCustomizer popover.
 *
 * The popover stacks up to two sections — a color swatch row and an icon grid.
 * Each section is a real 2-D grid with its own column count. Focus is a
 * (section, index) pair:
 *   ←/→  step within the current section's flat item list (wrapping)
 *   ↑/↓  move by ONE ROW within the section; only when that would leave the
 *        section's top/bottom edge does it cross to the adjacent section
 *        (260724 change: a 2-row icon grid steps row-1 → row-2 before jumping to
 *        the color row). Column is preserved (clamped) across a section cross.
 * Kept DOM-free so the wrap/clamp logic unit-tests without a browser; the
 * component maps the returned position back to a real button and focuses it.
 */
import { wrapIndex } from "./roving-index";

export interface GridPos {
  section: number;
  index: number;
}

/** One popover section: `count` items laid out in `cols` columns. */
export interface GridSection {
  count: number;
  cols: number;
}

export type GridNavKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

/** Index of the next non-empty section from `from` moving by `dir` (wrapping). */
function nextNonEmptySection(
  sections: GridSection[],
  from: number,
  dir: 1 | -1,
): number {
  const n = sections.length;
  let target = from;
  for (let i = 0; i < n; i++) {
    target = wrapIndex(target + dir, n);
    if ((sections[target]?.count ?? 0) > 0) return target;
  }
  return from;
}

/**
 * Next focus position given the current one, an arrow key, and the section
 * layout. ←/→ step within the section; ↑/↓ step by a row and only cross section
 * boundaries at the section's top/bottom edge.
 */
export function nextCustomizerFocus(
  pos: GridPos,
  key: GridNavKey,
  sections: GridSection[],
): GridPos {
  if (sections.length === 0) return pos;
  const { section, index } = pos;
  const sec = sections[section];
  if (!sec || sec.count <= 0) return pos;

  if (key === "ArrowLeft" || key === "ArrowRight") {
    const idx = wrapIndex(index + (key === "ArrowRight" ? 1 : -1), sec.count);
    return { section, index: idx };
  }

  const dir = key === "ArrowDown" ? 1 : -1;
  const col = index % sec.cols;
  const curRow = Math.floor(index / sec.cols);
  const lastRow = Math.floor((sec.count - 1) / sec.cols);
  // Step by a row WITHIN the section first (a shorter final row clamps to its
  // last item); only cross sections at the section's top/bottom edge.
  if (dir === 1 && curRow < lastRow) {
    return { section, index: Math.min(index + sec.cols, sec.count - 1) };
  }
  if (dir === -1 && curRow > 0) {
    return { section, index: index - sec.cols };
  }
  // At the section's edge → cross to the adjacent non-empty section, keeping col.
  const target = nextNonEmptySection(sections, section, dir);
  if (target === section) return pos; // single section → nowhere to cross
  const t = sections[target]!;
  if (dir === 1) {
    // Entered from the top → first row, same column (clamped to the row's width).
    return { section: target, index: Math.min(col, t.count - 1) };
  }
  // Entered from the bottom → last row, same column (clamped to the item count).
  const lastRowStart = Math.floor((t.count - 1) / t.cols) * t.cols;
  return { section: target, index: Math.min(lastRowStart + col, t.count - 1) };
}
