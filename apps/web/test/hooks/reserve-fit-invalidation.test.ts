/**
 * reserve-fit-invalidation.test.ts — ticking a one-off must show up at once
 * (user, 260810).
 *
 * Excluding two transactions from Altruism left the chart saying 46 was still
 * needed until the page was reloaded. The mutation did invalidate — but a key
 * that no longer existed: the query had been bumped to "reserve-fit-v2" and the
 * invalidation still named "reserve-fit". React Query matches prefixes element
 * by element, so it matched nothing and the stale answer stayed on screen.
 *
 * This pins the two together through React Query's own matcher, which is the
 * only thing that can tell they agree.
 */
import { describe, it, expect } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import {
  oneOffsKeyPrefix,
  reserveFitKeyPrefix,
  reserveFitQueryKey,
} from "../../src/hooks/use-reserve-fit";

const RANGE = ["2026-01-01", "2026-01-31"] as const;

describe("the reserve-fit query and the mutation that refreshes it", () => {
  it("invalidates the query the chart is actually reading", async () => {
    const qc = new QueryClient();
    const key = reserveFitQueryKey("b1", ...RANGE);
    qc.setQueryData(key, { rows: [] });
    await qc.invalidateQueries({ queryKey: reserveFitKeyPrefix("b1") });
    expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
  });

  it("leaves another budget's chart alone", async () => {
    const qc = new QueryClient();
    const other = reserveFitQueryKey("b2", ...RANGE);
    qc.setQueryData(other, { rows: [] });
    await qc.invalidateQueries({ queryKey: reserveFitKeyPrefix("b1") });
    expect(qc.getQueryState(other)?.isInvalidated).toBe(false);
  });

  /**
   * The dialog's list is its OWN query now — paged off /overview/one-offs
   * rather than carved out of the reserve-fit payload (260813). So a tick has
   * two things to refresh, and refreshing only the chart left the reopened
   * dialog showing the old ticks and a badge counting none of them.
   */
  it("also refreshes the list the dialog is reading", async () => {
    const qc = new QueryClient();
    const list = [
      "budget",
      "b1",
      "one-offs",
      "2026-01-01",
      "2026-01-31",
      "all",
    ];
    qc.setQueryData(list, { pages: [] });
    await qc.invalidateQueries({ queryKey: oneOffsKeyPrefix("b1") });
    expect(qc.getQueryState(list)?.isInvalidated).toBe(true);
  });

  it("leaves another budget's list alone", async () => {
    const qc = new QueryClient();
    const other = [
      "budget",
      "b2",
      "one-offs",
      "2026-01-01",
      "2026-01-31",
      "all",
    ];
    qc.setQueryData(other, { pages: [] });
    await qc.invalidateQueries({ queryKey: oneOffsKeyPrefix("b1") });
    expect(qc.getQueryState(other)?.isInvalidated).toBe(false);
  });

  it("catches every range of that budget, whichever is on screen", async () => {
    const qc = new QueryClient();
    const a = reserveFitQueryKey("b1", "2025-09-01", "2026-08-31");
    const b = reserveFitQueryKey("b1", ...RANGE);
    qc.setQueryData(a, { rows: [] });
    qc.setQueryData(b, { rows: [] });
    await qc.invalidateQueries({ queryKey: reserveFitKeyPrefix("b1") });
    expect(qc.getQueryState(a)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(b)?.isInvalidated).toBe(true);
  });
});
