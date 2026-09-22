// apps/web/test/lib/projection-window-view.test.ts
/**
 * Answering the forecast card for a window SHORTER than the payload in hand.
 *
 * The horizon slider draws from one wide payload, and the two figures beside the
 * band — free-to-move and the deficit — have to move with it. Re-asking the
 * server per pixel is what the wide payload exists to avoid, so the prefix is
 * computed here instead, from exactly the terms the server used:
 *
 *   safe        = safe_by_day[N-1]   (running trough of the pessimistic run)
 *   thinnest    = the first day that trough reached its final value
 *   first red   = the first red day inside the window
 *   shortfall   = the deepest the EVEN line went under, or 0
 *
 * If any of that drifted from the server the card would disagree with itself the
 * moment the drag ended, so these are pinned against hand-worked numbers.
 */
import { describe, test, expect } from "vitest";
import { projectionAtWindow } from "@/lib/projection-window-view";
import type { ProjectionDTO } from "@/hooks/use-projection";

/** available[] → a DTO, with safe_by_day as the running minimum of `worst`. */
function dto(available: number[], worst?: number[]): ProjectionDTO {
  const w = worst ?? available;
  const running: number[] = [];
  let low: number | null = null;
  for (const v of w) {
    low = low === null || v < low ? v : low;
    running.push(low);
  }
  return {
    currency: "PLN",
    days: available.map((cents, i) => ({
      date: `2026-09-${String(i + 1).padStart(2, "0")}`,
      color: cents < 0 ? "red" : "green",
      available_cents: String(cents),
      opening_cents: "0",
      planned_burn_cents: "0",
      reserve_covered_cents: "0",
      income_cents: "0",
      bill_cents: "0",
      drew_reserve: [],
      shortfall: [],
    })),
    safe_by_day: running.map(String),
    income_points: [],
    bill_points: [],
    pending_points: [],
    summary: {
      first_yellow_date: null,
      first_red_date: null,
      worst_shortfall_cents: "0",
    },
    spend_health: { good: true, surplus_deficit_cents: null },
  };
}

describe("projectionAtWindow", () => {
  test("reads the trough off safe_by_day, not off the visible line", () => {
    // The pessimistic run dips lower than the even one — that gap is the whole
    // reason the server sends a separate series.
    const d = dto([500, 400, 300], [500, 100, 300]);
    expect(projectionAtWindow(d, 3)!.safe.cents).toBe("100");
  });

  test("a shorter window is a shorter prefix", () => {
    const d = dto([500, 400, 300], [500, 400, 50]);
    expect(projectionAtWindow(d, 2)!.safe.cents).toBe("400");
    expect(projectionAtWindow(d, 3)!.safe.cents).toBe("50");
  });

  test("names the day the trough was first reached", () => {
    const d = dto([500, 200, 200, 200], [500, 200, 200, 200]);
    const at = projectionAtWindow(d, 4)!;
    // Three days share the low; the FIRST is the one that answers "when".
    expect(at.safe.thinnest_date).toBe("2026-09-02");
  });

  test("finds the first red day inside the window, and only inside it", () => {
    const d = dto([500, -100, 300]);
    expect(projectionAtWindow(d, 3)!.first_red_date).toBe("2026-09-02");
    expect(projectionAtWindow(d, 1)!.first_red_date).toBeNull();
  });

  test("the shortfall is the deepest the line went under, as a positive", () => {
    const d = dto([500, -100, -900, 200]);
    expect(projectionAtWindow(d, 4)!.worst_shortfall_cents).toBe("900");
    // Nothing under water in the first day → nothing to report.
    expect(projectionAtWindow(d, 1)!.worst_shortfall_cents).toBe("0");
  });

  test("declines to answer a window it does not hold the days for", () => {
    const d = dto([500, 400]);
    expect(projectionAtWindow(d, 9)).toBeNull();
    expect(projectionAtWindow(d, 0)).toBeNull();
  });

  test("declines when the payload predates safe_by_day", () => {
    const d = dto([500, 400]);
    delete (d as { safe_by_day?: string[] }).safe_by_day;
    // An older cached payload must fall back to the server's own figures rather
    // than have this invent one.
    expect(projectionAtWindow(d, 2)).toBeNull();
  });
});
