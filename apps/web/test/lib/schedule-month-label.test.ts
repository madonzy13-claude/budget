import { describe, it, expect } from "vitest";
import {
  scheduleMonthLabel,
  scheduleMonthTick,
} from "@/lib/schedule-month-label";

describe("scheduleMonthLabel", () => {
  // The upcoming-payments chart can span more than a year now (a one-time
  // payment two years out sets the horizon), so a bare month name would put
  // two different Septembers under the same word.
  it("names the month and its year", () => {
    expect(scheduleMonthLabel("2026-09", "en")).toBe("September 2026");
  });

  it("keeps the year even when the span is short", () => {
    expect(scheduleMonthLabel("2027-01", "en")).toBe("January 2027");
  });

  it("returns the raw value for something unparseable", () => {
    expect(scheduleMonthLabel("nonsense", "en")).toBe("nonsense");
  });
});

describe("scheduleMonthTick", () => {
  it("is short enough for an axis but still says which year", () => {
    expect(scheduleMonthTick("2026-09", "en")).toBe("Sep 26");
  });

  it("does not drop a year boundary", () => {
    expect(scheduleMonthTick("2027-01", "en")).toBe("Jan 27");
  });

  it("returns the raw value for something unparseable", () => {
    expect(scheduleMonthTick("nope", "en")).toBe("nope");
  });
});
