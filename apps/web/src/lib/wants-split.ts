/**
 * wants-split.ts — does the planned timeline carry a real needs/wants split?
 *
 * Two ways the band is pointless:
 *  - wants is ZERO everywhere (needs-only budget) — recharts still strokes a
 *    hairline along the top of the needs area, which reads as a stray coloured
 *    line (user screenshot, 260731);
 *  - wants MIRRORS needs (categories were never split) — stacking them doubles
 *    the planned band and draws a copy of the needs area.
 * So the band needs at least one point with real, distinct wants money.
 */
export function hasWantsSplit(
  timeline: Array<{
    needs_cents: string | number;
    wants_cents: string | number;
  }>,
): boolean {
  return timeline.some(
    (p) =>
      Number(p.wants_cents) > 0 &&
      Number(p.wants_cents) !== Number(p.needs_cents),
  );
}
