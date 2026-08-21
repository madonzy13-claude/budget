/**
 * future-expected.ts — what the Future reading measures a limit against.
 *
 * The Planned section's Future switch asks "what will this category NEED?" and
 * draws the gap between that and the limit it carries today. For a No-limit
 * category (mig 0083) the honest answer is: nothing needs to change, because
 * there is no limit to change (user, 260820). Returning the CURRENT figure —
 * rather than the projection, or a bare 0 — makes the gap zero by construction,
 * so the bar reads 0 zł, the totals line moves by nothing, and the suggestion
 * button is inert exactly as it is for a category that is already right.
 *
 * A bare 0 would have been wrong in the other direction: the gap is
 * `expected − current`, so it would have proposed REMOVING the whole limit.
 *
 * Pure and shared because three places in planned-section.tsx read it — the
 * bars, the totals line and the limit dialog — and they must agree.
 */
export function futureExpectedCents(input: {
  /** What an average month ahead costs, per the reserve walk. Null when it has
   *  no opinion (a reserve-excluded category has no row). */
  projected: number | null | undefined;
  /** The limit the category carries today: needs + wants. */
  currentCents: number;
  /** mig 0083 — the category is unbounded. */
  noLimit: boolean;
}): number | null {
  if (input.noLimit) return input.currentCents;
  return input.projected ?? null;
}
