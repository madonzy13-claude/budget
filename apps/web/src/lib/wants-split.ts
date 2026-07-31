/**
 * wants-split.ts — does the planned timeline carry a real needs/wants split?
 *
 * A budget whose categories were never split reports the SAME figure in both
 * series. Stacking them would double the planned band and draw a pink WANTS copy
 * of the green NEEDS one, so the planned-vs-actual chart drops the pink band
 * unless at least one point genuinely differs (260731 user decision).
 */
export function hasWantsSplit(
  timeline: Array<{
    needs_cents: string | number;
    wants_cents: string | number;
  }>,
): boolean {
  return timeline.some((p) => Number(p.wants_cents) !== Number(p.needs_cents));
}
