import { describe, it, expect } from "vitest";
import {
  centsToBare,
  centsToDisplayCompact,
  centsToPlAmount,
  centsToRounded,
  roundsToZero,
} from "../../src/lib/cents-format";

// Intl separates the amount and sign with a non-breaking space; normalise it so
// the assertions read plainly.
const norm = (s: string) => s.replace(/[\u00a0\u202f]/g, " ");

describe("narrow currency sign position", () => {
  it("puts suffix-convention signs AFTER the amount (zł, kr)", () => {
    expect(norm(centsToDisplayCompact("91693700", "PLN", "en", true))).toBe(
      "916,937 zł",
    );
    expect(norm(centsToRounded("91693700", "PLN", "en", true))).toBe(
      "916,937 zł",
    );
    expect(norm(centsToDisplayCompact("70000", "SEK", "en", true))).toBe(
      "700 kr",
    );
  });

  it("keeps prefix signs BEFORE the amount ($, €)", () => {
    expect(norm(centsToDisplayCompact("91693700", "USD", "en", true))).toBe(
      "$916,937",
    );
    expect(norm(centsToDisplayCompact("70000", "EUR", "en", true))).toBe(
      "€700",
    );
  });

  // Moving the sign to the end leaves behind the space that separated it from
  // the number, so a deficit read "- 3,209 zł" (user, 260812).
  it("keeps the minus attached to the amount", () => {
    expect(norm(centsToRounded("-320900", "PLN", "en", true))).toBe(
      "-3,209 zł",
    );
    expect(norm(centsToDisplayCompact("-320900", "PLN", "en", true))).toBe(
      "-3,209 zł",
    );
    expect(norm(centsToRounded("-70000", "SEK", "en", true))).toBe("-700 kr");
    // …and the prefix-sign currencies were never affected.
    expect(norm(centsToRounded("-320900", "USD", "en", true))).toBe("-$3,209");
  });

  it("does not reposition the ISO-code fallback (narrow=false)", () => {
    expect(norm(centsToDisplayCompact("70000", "PLN", "en"))).toBe("PLN 700");
  });
});

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

describe("roundsToZero", () => {
  // The by-category bars are coloured by variance but labelled in whole units.
  // A category 31 gr over plan drew a RED bar labelled "+0 zł" — a screen
  // contradicting itself (user report, 260807). Anything the label cannot show
  // is not a value to colour.
  it("agrees with what centsToRounded prints", () => {
    for (const cents of [0, 1, 49, -49, 50, -50, 99, 149, 12345]) {
      const printsZero = /^[^\d]*0[^\d]*$/.test(
        centsToRounded(BigInt(cents), "PLN", "en", true),
      );
      expect(roundsToZero(cents)).toBe(printsZero);
    }
  });

  it("is true under half a unit, either direction", () => {
    expect(roundsToZero(0)).toBe(true);
    expect(roundsToZero(31)).toBe(true);
    expect(roundsToZero(-31)).toBe(true);
    expect(roundsToZero(49)).toBe(true);
  });

  it("is false from half a unit up", () => {
    expect(roundsToZero(50)).toBe(false);
    expect(roundsToZero(-50)).toBe(false);
    expect(roundsToZero(100)).toBe(false);
  });

  it("takes bigints as well as numbers", () => {
    expect(roundsToZero(49n)).toBe(true);
    expect(roundsToZero(-50n)).toBe(false);
  });
});

/**
 * P/L amounts: a night that moved +17 gr printed "0 zł", which reads as no
 * movement (user, 260819). Under 100 units the cents carry the whole story, so
 * they stay; above it they are noise against a four-figure number.
 */
describe("centsToPlAmount", () => {
  it("keeps cents under 100 units", () => {
    expect(norm(centsToPlAmount("17", "PLN", "en", true))).toBe("0.17 zł");
    expect(norm(centsToPlAmount("-17", "PLN", "en", true))).toBe("-0.17 zł");
    expect(norm(centsToPlAmount("5750", "USD", "en", true))).toBe("$57.50");
  });

  it("drops a whole-unit .00 rather than padding it", () => {
    expect(norm(centsToPlAmount("5700", "USD", "en", true))).toBe("$57");
  });

  it("rounds to whole units from 100 up — cents add width, not meaning", () => {
    expect(norm(centsToPlAmount("10000", "USD", "en", true))).toBe("$100");
    expect(norm(centsToPlAmount("123456", "PLN", "en", true))).toBe("1,235 zł");
  });

  it("survives a non-numeric amount instead of crashing the card", () => {
    expect(norm(centsToPlAmount("NaN", "USD", "en", true))).toBe("$0");
  });
});
