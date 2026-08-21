/**
 * category-colors.ts — single source of truth for the 20 per-category palette
 * colors (8 original, 260613-v1p; 12 added 260820 on user request).
 *
 * DESIGN.md note: the per-category color bar is a DELIBERATE multi-color
 * exception scoped to categorization only (a 4px card-edge strip). The yellow
 * `--primary` stays the sole accent for active/CTA/interactive state — the bar
 * is decorative/secondary and never the only signal (the category NAME remains
 * the primary identifier → a11y-safe; no contrast requirement on a 4px strip).
 *
 * Consumers:
 *   - category-slider.tsx color picker maps over CATEGORY_COLORS (swatch grid).
 *   - category-column.tsx + reserves-table-row.tsx render the accent bar via
 *     hexForColorKey(colorKey).
 * Hexes MUST match the persisted colorKey enum keys (contracts/api.ts).
 */
export const CATEGORY_COLORS = [
  { key: "yellow", hex: "#F0B90B" },
  { key: "green", hex: "#26A69A" },
  { key: "blue", hex: "#4A90D9" },
  { key: "red", hex: "#EF5350" },
  { key: "orange", hex: "#FF8F00" },
  { key: "purple", hex: "#7C4DFF" },
  { key: "pink", hex: "#EC407A" },
  { key: "gray", hex: "#78909C" },
  // 260820: twelve more, so the picker fills two whole rows of ten. Kept to the
  // same mid-saturation register as the originals — these sit behind a category
  // NAME on a 4px strip, so they only need to be distinguishable from each
  // other, not legible on their own.
  { key: "cyan", hex: "#00ACC1" },
  { key: "lime", hex: "#9CCC65" },
  { key: "indigo", hex: "#5C6BC0" },
  { key: "teal", hex: "#009688" },
  { key: "amber", hex: "#FFB300" },
  { key: "brown", hex: "#8D6E63" },
  { key: "magenta", hex: "#D81B60" },
  { key: "olive", hex: "#827717" },
  { key: "navy", hex: "#3949AB" },
  { key: "coral", hex: "#FF7043" },
  { key: "mint", hex: "#4DB6AC" },
  { key: "slate", hex: "#546E7A" },
] as const;

export type CategoryColorKey = (typeof CATEGORY_COLORS)[number]["key"];

const HEX: Record<string, string> = Object.fromEntries(
  CATEGORY_COLORS.map((c) => [c.key, c.hex]),
);

/**
 * Map a stored colorKey to its hex, or null for null/unknown keys.
 * null → caller renders NO accent bar (the neutral "no color" look).
 */
export function hexForColorKey(key: string | null | undefined): string | null {
  if (!key) return null;
  return HEX[key] ?? null;
}
