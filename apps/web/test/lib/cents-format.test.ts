import { describe, it, expect } from "vitest";
import { centsToBare } from "../../src/lib/cents-format";

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
