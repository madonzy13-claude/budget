import { describe, it, expect } from "vitest";
import { centsToBare, centsToDisplayCompact } from "../../src/lib/cents-format";

describe("centsToDisplayCompact narrow currency symbol", () => {
  it("uses the narrow symbol (kr, zł, ₴) not the ISO code when narrow=true", () => {
    expect(centsToDisplayCompact("70000", "SEK", "en", true)).toContain("kr");
    expect(centsToDisplayCompact("70000", "SEK", "en", true)).not.toContain(
      "SEK",
    );
    expect(centsToDisplayCompact("70000", "PLN", "en", true)).toContain("zł");
    expect(centsToDisplayCompact("70000", "UAH", "en", true)).toContain("₴");
    expect(centsToDisplayCompact("70000", "USD", "en", true)).toContain("$");
  });

  it("drops the .00 fraction but keeps a non-zero fraction", () => {
    expect(centsToDisplayCompact("70000", "USD", "en", true)).toBe("$700");
    expect(centsToDisplayCompact("1750", "USD", "en", true)).toBe("$17.50");
  });
});

describe("centsToBare", () => {
  it("drops the .00 fraction for whole amounts", () => {
    expect(centsToBare("50000")).toBe("500");
    expect(centsToBare("1600")).toBe("16");
    expect(centsToBare("0")).toBe("0");
  });

  it("pads non-zero fractions to two decimals", () => {
    expect(centsToBare("320")).toBe("3.20");
    expect(centsToBare("10")).toBe("0.10");
    expect(centsToBare("1325")).toBe("13.25");
  });

  it("never shows a currency symbol", () => {
    expect(centsToBare("50000")).not.toMatch(/[$€£₴]/);
    expect(centsToBare("320")).not.toMatch(/[$€£₴]/);
  });

  it("handles negative amounts with a leading minus", () => {
    expect(centsToBare("-52900")).toBe("-529");
    expect(centsToBare("-320")).toBe("-3.20");
  });

  it("accepts bigint input", () => {
    expect(centsToBare(50000n)).toBe("500");
    expect(centsToBare(320n)).toBe("3.20");
  });
});
