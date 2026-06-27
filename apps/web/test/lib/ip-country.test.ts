import { describe, it, expect } from "vitest";
import { flagEmoji } from "../../src/lib/ip-country";

describe("flagEmoji", () => {
  it("maps ISO alpha-2 codes to regional-indicator flags", () => {
    expect(flagEmoji("PL")).toBe("🇵🇱");
    expect(flagEmoji("US")).toBe("🇺🇸");
    expect(flagEmoji("ua")).toBe("🇺🇦"); // case-insensitive
  });

  it("returns empty for invalid input", () => {
    expect(flagEmoji("")).toBe("");
    expect(flagEmoji(null)).toBe("");
    expect(flagEmoji("USA")).toBe("");
    expect(flagEmoji("1")).toBe("");
  });
});
