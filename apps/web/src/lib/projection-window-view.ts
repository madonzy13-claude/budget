/**
 * projection-window-view.ts — the forecast card's figures for a window SHORTER
 * than the payload in hand.
 *
 * The horizon slider draws from ONE wide payload and every position inside it is
 * a prefix (the simulation runs forward, so a shorter window is a prefix of a
 * longer one). The two figures beside the band — free-to-move and the deficit —
 * have to move with the thumb, and re-asking the server per pixel is exactly
 * what the wide payload exists to avoid, so they are computed here instead.
 *
 * Every term below mirrors what the server does for a window of that length, so
 * the number under a moving thumb is the number the card settles on when the
 * drag ends. If the payload cannot answer — it predates `safe_by_day`, or simply
 * does not hold that many days — this returns null and the caller keeps the
 * server's own figures rather than showing an invented one.
 */
import type { ProjectionDTO } from "@/hooks/use-projection";

export interface ProjectionWindowView {
  /** Trough of the pessimistic run over the window, and the day it happens. */
  safe: { cents: string; thinnest_date: string | null };
  /** First day the EVEN line goes under inside the window, if any. */
  first_red_date: string | null;
  /** How deep it went under, as a positive figure. "0" when it never did. */
  worst_shortfall_cents: string;
}

export function projectionAtWindow(
  dto: ProjectionDTO,
  days: number,
): ProjectionWindowView | null {
  const safeSeries = dto.safe_by_day;
  if (!Array.isArray(safeSeries) || safeSeries.length === 0) return null;
  if (!Number.isFinite(days) || days < 1) return null;
  if (days > dto.days.length || days > safeSeries.length) return null;

  const cents = safeSeries[days - 1]!;
  // The running minimum is monotone non-increasing, so the first index carrying
  // the final value is the day the trough was reached. Later days that merely
  // MATCH it are not when it happened.
  let thinnestIdx = 0;
  for (let i = 0; i < days; i++) {
    if (safeSeries[i] === cents) {
      thinnestIdx = i;
      break;
    }
  }

  let firstRed: string | null = null;
  let worst = 0n;
  for (let i = 0; i < days; i++) {
    const d = dto.days[i]!;
    if (firstRed === null && d.color === "red") firstRed = d.date;
    const available = BigInt(d.available_cents);
    if (available < 0n && -available > worst) worst = -available;
  }

  return {
    safe: { cents, thinnest_date: dto.days[thinnestIdx]?.date ?? null },
    first_red_date: firstRed,
    worst_shortfall_cents: worst.toString(),
  };
}
