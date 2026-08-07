/**
 * label-span.ts — the horizontal span of a row of centred labels (260805).
 *
 * The spend breakdown bar sits directly over three figures and reads as their
 * key, so it has to start where the first word starts and stop where the last
 * word stops — not at the grid's edges, which run wider than the centred text
 * inside them.
 *
 * Measured rather than guessed: the columns are equal but the labels are not,
 * and they change with the locale ("Under plan" / "Poniżej planu").
 */
export interface Span {
  left: number;
  right: number;
}

export function labelSpan(row: Span, first: Span, last: Span): Span {
  return {
    left: Math.max(0, first.left - row.left),
    right: Math.max(0, row.right - last.right),
  };
}
