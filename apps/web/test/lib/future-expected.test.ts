/**
 * future-expected.test.ts — what the Future reading measures a limit against.
 *
 * 0083 (user, 260820): a No-limit category must always read 0 in the Future
 * switch. There is nothing to add to a limit that does not exist, so the gap
 * between "what it has" and "what it will need" has to be zero by construction
 * rather than by the two happening to agree.
 */
import { describe, it, expect } from "vitest";
import { futureExpectedCents } from "@/lib/future-expected";

describe("futureExpectedCents", () => {
  it("returns the projection for an ordinary category", () => {
    expect(
      futureExpectedCents({
        projected: 79800,
        currentCents: 77900,
        noLimit: false,
      }),
    ).toBe(79800);
  });

  it("returns null when the walk has no opinion", () => {
    // A reserve-excluded category has no projection; the caller falls back.
    expect(
      futureExpectedCents({
        projected: null,
        currentCents: 77900,
        noLimit: false,
      }),
    ).toBeNull();
  });

  it("matches the current figure for a No-limit category, so the gap is 0", () => {
    expect(
      futureExpectedCents({
        projected: 500000,
        currentCents: 1463000,
        noLimit: true,
      }),
    ).toBe(1463000);
  });

  it("does so even when the walk has no projection at all", () => {
    expect(
      futureExpectedCents({
        projected: null,
        currentCents: 1463000,
        noLimit: true,
      }),
    ).toBe(1463000);
  });

  it("is 0 for an unbounded category that has spent nothing", () => {
    expect(
      futureExpectedCents({ projected: 900, currentCents: 0, noLimit: true }),
    ).toBe(0);
  });
});
