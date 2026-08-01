/**
 * today-tail.test.ts — give TODAY its own day of width (260801).
 *
 * Points sit at the START of their day, so a month one day old had all of its
 * geometry — the reset and the day's spend — at one x: the spend was drawn as a
 * vertical over the grey reset line (user screenshot). Carrying the last reading
 * to the end of today gives it a day of width, which is exactly its share of the
 * range; the running month stays proportional to the days it has actually had.
 */
import { describe, it, expect } from "vitest";
import { appendTodayTail } from "../../src/lib/today-tail";

const row = (ts: string, real: number) => ({
  label: ts,
  ts: Date.parse(`${ts}T00:00:00Z`),
  real,
  needs: 400,
  wants: 100,
});

describe("appendTodayTail", () => {
  it("carries today's reading to the end of today", () => {
    const out = appendTodayTail([row("2026-08-01", 1200)], "2026-08-01");
    expect(out).toHaveLength(2);
    const tail = out[1]!;
    expect(tail.ts).toBe(Date.parse("2026-08-02T00:00:00Z"));
    expect([tail.real, tail.needs, tail.wants]).toEqual([1200, 400, 100]);
    // Geometry only: no tick of its own, no tooltip.
    expect(tail.reset).toBe(true);
  });

  it("carries a monthly point too — it is clamped to today", () => {
    const out = appendTodayTail(
      [
        {
          ...row("2026-08-31", 900),
          label: "2026-08",
          ts: Date.parse("2026-08-01T00:00:00Z"),
        },
      ],
      "2026-08-01",
    );
    expect(out).toHaveLength(2);
    expect(out[1]!.ts).toBe(Date.parse("2026-08-02T00:00:00Z"));
  });

  it("leaves a series that does not reach today alone", () => {
    const rows = [row("2026-07-31", 900)];
    expect(appendTodayTail(rows, "2026-08-01")).toEqual(rows);
  });

  it("is a no-op for an empty series", () => {
    expect(appendTodayTail([], "2026-08-01")).toEqual([]);
  });
});
