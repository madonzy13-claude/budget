/**
 * customizer-nav.ts — pure keyboard-grid math for the WalletCustomizer popover
 * (260724, task 3). The popover stacks up to two sections — a color swatch row
 * and an icon grid. Focus is a (section, index) pair:
 *   ←/→  step within the current section's flat item list (wrapping)
 *   ↑/↓  jump to the previous / next SECTION (wrapping), clamping the column
 *        so a shorter section never lands out of range.
 * Kept DOM-free so the wrap/clamp logic unit-tests without a browser; the
 * component maps the returned position back to a real button and focuses it.
 */
import { wrapIndex } from "./roving-index";

export interface GridPos {
  section: number;
  index: number;
}

export type GridNavKey = "ArrowLeft" | "ArrowRight" | "ArrowUp" | "ArrowDown";

/**
 * Next focus position given the current one, an arrow key, and each section's
 * item count. Sections with zero items are skipped over on ↑/↓ so an empty
 * (hidden) color section never traps focus.
 */
export function nextCustomizerFocus(
  pos: GridPos,
  key: GridNavKey,
  sizes: number[],
): GridPos {
  const nSec = sizes.length;
  if (nSec === 0) return pos;
  let { section, index } = pos;

  if (key === "ArrowLeft" || key === "ArrowRight") {
    const size = sizes[section] ?? 0;
    if (size <= 0) return pos;
    index = wrapIndex(index + (key === "ArrowRight" ? 1 : -1), size);
    return { section, index };
  }

  // ↑/↓ — move to the previous / next non-empty section, clamp the column.
  const dir = key === "ArrowDown" ? 1 : -1;
  let next = section;
  for (let i = 0; i < nSec; i++) {
    next = wrapIndex(next + dir, nSec);
    if ((sizes[next] ?? 0) > 0) break;
  }
  const size = sizes[next] ?? 0;
  return { section: next, index: Math.min(index, Math.max(0, size - 1)) };
}
