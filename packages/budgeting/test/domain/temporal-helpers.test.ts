import { describe, test, expect } from "bun:test";
import { Temporal } from "temporal-polyfill";
import {
  firstDayOfMonth,
  lastDayOfMonth,
  plainDateToDateUTC,
} from "../../src/domain/temporal-helpers";

describe("Temporal Helpers", () => {
  describe("firstDayOfMonth", () => {
    test("returns first day of month in UTC", () => {
      const at = new Date("2026-04-15T12:00:00.000Z");
      const result = firstDayOfMonth(at, "UTC");
      expect(result.toString()).toBe("2026-04-01");
    });

    test("returns first day of month in Europe/Warsaw — cross-midnight edge", () => {
      // 2026-04-30T23:00:00 UTC = 2026-05-01T01:00:00 in Warsaw (CEST = UTC+2)
      const at = new Date("2026-04-30T23:00:00.000Z");
      const result = firstDayOfMonth(at, "Europe/Warsaw");
      expect(result.toString()).toBe("2026-05-01");
    });

    test("returns first day of month in America/New_York", () => {
      // 2026-05-15T10:00:00 UTC = 2026-05-15T06:00:00 in NY (EDT = UTC-4)
      const at = new Date("2026-05-15T10:00:00.000Z");
      const result = firstDayOfMonth(at, "America/New_York");
      expect(result.toString()).toBe("2026-05-01");
    });

    test("cross-DST: NY midnight crossing into new month", () => {
      // 2026-02-28T05:00:00 UTC = 2026-02-28T00:00:00 in EST (UTC-5) — still Feb
      const at = new Date("2026-02-28T05:00:00.000Z");
      const result = firstDayOfMonth(at, "America/New_York");
      expect(result.toString()).toBe("2026-02-01");
    });
  });

  describe("lastDayOfMonth", () => {
    test("returns last day of February (non-leap)", () => {
      const at = new Date("2026-02-10T12:00:00.000Z");
      const result = lastDayOfMonth(at, "UTC");
      expect(result.toString()).toBe("2026-02-28");
    });

    test("returns last day of February (leap year)", () => {
      const at = new Date("2024-02-10T12:00:00.000Z");
      const result = lastDayOfMonth(at, "UTC");
      expect(result.toString()).toBe("2024-02-29");
    });

    test("returns last day of month with 31 days", () => {
      const at = new Date("2026-01-15T12:00:00.000Z");
      const result = lastDayOfMonth(at, "UTC");
      expect(result.toString()).toBe("2026-01-31");
    });
  });

  describe("plainDateToDateUTC", () => {
    test("converts PlainDate to midnight UTC Date", () => {
      const pd = Temporal.PlainDate.from("2026-04-01");
      const result = plainDateToDateUTC(pd);
      expect(result.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    });
  });
});
