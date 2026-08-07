/**
 * slice-colors.ts — one colour per pie slice (260803).
 *
 * The pie coloured slice i with CATEGORY_COLORS[i % 8], so a budget with more
 * than eight categories wrapped and two slices came out identical — Investments
 * arrived and took Kids' green (user screenshot). A category's persisted colour
 * could collide with another's fallback the same way.
 *
 * The eight brand colours stay the first choices; beyond them the same hues come
 * back lighter, then darker, which keeps every slice on the palette's family
 * while staying tellable apart. Colours are handed out greedily: a category keeps
 * its own if no earlier slice has claimed it, otherwise it takes the next free
 * one.
 */
import { CATEGORY_COLORS } from "./category-colors";

/** Mix a hex toward white (positive) or black (negative), by `amount` 0..1. */
function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const target = amount > 0 ? 255 : 0;
  const t = Math.abs(amount);
  const mix = (c: number) => Math.round(c + (target - c) * t);
  const r = mix((n >> 16) & 0xff);
  const g = mix((n >> 8) & 0xff);
  const b = mix(n & 0xff);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/**
 * Every colour a slice may take, in order of preference: the brand eight, then
 * the same hues lightened, then darkened. 24 in all — more categories than any
 * household budget carries, and the assignment still answers past that.
 */
export const SLICE_PALETTE: string[] = [
  ...CATEGORY_COLORS.map((c) => c.hex),
  ...CATEGORY_COLORS.map((c) => shade(c.hex, 0.42)),
  ...CATEGORY_COLORS.map((c) => shade(c.hex, -0.4)),
];

/**
 * name → colour, no two the same. `colorOf` returns the category's persisted
 * hex, or null when it has none. Order matters and is the caller's: the first
 * slice to want a colour keeps it.
 */
export function assignSliceColors(
  names: readonly string[],
  colorOf: (name: string) => string | null | undefined,
): Map<string, string> {
  const out = new Map<string, string>();
  const taken = new Set<string>();
  const claim = (name: string, hex: string) => {
    out.set(name, hex);
    taken.add(hex.toLowerCase());
  };

  // Pass 1 — honour each category's own colour while it is still free.
  for (const name of names) {
    const own = colorOf(name);
    if (own && !taken.has(own.toLowerCase())) claim(name, own);
  }
  // Pass 2 — everyone else takes the next colour nobody is using.
  let next = 0;
  for (const name of names) {
    if (out.has(name)) continue;
    while (
      next < SLICE_PALETTE.length &&
      taken.has(SLICE_PALETTE[next]!.toLowerCase())
    ) {
      next += 1;
    }
    // Past the end of the palette every colour is spoken for; wrap rather than
    // leave a slice unpainted — a repeat beyond 24 categories beats a black gap.
    claim(
      name,
      SLICE_PALETTE[next] ?? SLICE_PALETTE[out.size % SLICE_PALETTE.length]!,
    );
  }
  return out;
}
