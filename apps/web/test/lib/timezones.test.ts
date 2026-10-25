/**
 * timezones.test.ts — the picker names Kyiv the way Ukraine does (user, 261023).
 *
 * Browsers still list the legacy id "Europe/Kiev"; "Europe/Kyiv" is the same
 * zone under its current IANA name, and every engine we run accepts it.
 */
import { describe, it, expect } from "vitest";
import { canonicalZone, listTimezones } from "../../src/lib/timezones";

describe("timezones", () => {
  it("lists Kyiv, never the legacy Kiev", () => {
    const zones = listTimezones();
    expect(zones).toContain("Europe/Kyiv");
    expect(zones).not.toContain("Europe/Kiev");
  });

  it("shows a saved legacy Kiev as Kyiv", () => {
    expect(canonicalZone("Europe/Kiev")).toBe("Europe/Kyiv");
    expect(canonicalZone("Europe/Warsaw")).toBe("Europe/Warsaw");
  });
});
