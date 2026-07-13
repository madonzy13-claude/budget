import { describe, it, expect } from "vitest";
import { dayCloseDelta } from "../../src/lib/day-close-delta";

// Hourly wealth series (UTC-hour labels, as the overview/wealth endpoint returns).
const series = [
  { label: "2026-07-12T20", value_cents: "149159500" },
  { label: "2026-07-12T22", value_cents: "149136600" }, // Warsaw (UTC+2) midnight = yesterday's close
  { label: "2026-07-12T23", value_cents: "148951000" },
  { label: "2026-07-13T00", value_cents: "148984100" }, // UTC midnight
  { label: "2026-07-13T05", value_cents: "148795891" }, // latest / live
];
const now = Date.UTC(2026, 6, 13, 5, 30); // 2026-07-13 05:30Z (Warsaw 07:30)

describe("dayCloseDelta — P/L since yesterday's close in the viewer's tz", () => {
  it("anchors on the user-tz midnight bucket (Warsaw ⇒ 07-12 22:00Z)", () => {
    const d = dayCloseDelta(series, "Europe/Warsaw", now)!;
    // latest − value at 2026-07-12T22
    expect(d.delta_cents).toBe(String(148795891 - 149136600)); // "-340709"
    expect(d.delta_pct!).toBeCloseTo(
      ((148795891 - 149136600) / 149136600) * 100,
      4,
    );
  });

  it("uses UTC midnight when tz is UTC (07-13 00:00Z)", () => {
    const d = dayCloseDelta(series, "UTC", now)!;
    expect(d.delta_cents).toBe(String(148795891 - 148984100)); // "-188209"
  });

  it("differs from the naive 'since yesterday-midnight' (~29h) figure", () => {
    // Old metric anchored on the first in-range bucket (07-12T20) — a bigger base window.
    const warsaw = dayCloseDelta(series, "Europe/Warsaw", now)!;
    const naive = 148795891 - 149159500; // vs first bucket
    expect(Number(warsaw.delta_cents)).not.toBe(naive);
  });

  it("returns null on empty series or bad tz", () => {
    expect(dayCloseDelta([], "Europe/Warsaw", now)).toBeNull();
    expect(dayCloseDelta(series, "Not/AZone", now)).toBeNull();
  });

  it("delta_pct is null when the base value is zero", () => {
    const s = [
      { label: "2026-07-12T22", value_cents: "0" },
      { label: "2026-07-13T05", value_cents: "1000" },
    ];
    expect(dayCloseDelta(s, "Europe/Warsaw", now)!.delta_pct).toBeNull();
  });
});
