/**
 * category-colors.ts — single source of truth for the 8 per-category palette
 * colors (260613-v1p).
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
