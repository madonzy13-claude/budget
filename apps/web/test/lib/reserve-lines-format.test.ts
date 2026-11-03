/**
 * reserve-lines-format.test.ts — UI-SPEC §6: the reserve amount reads as a
 * locale list of per-currency parts ("120 PLN and 15 EUR (≈ 64 PLN)").
 */
import { describe, it, expect } from "vitest";
import { formatReserveLines } from "@/lib/reserve-lines-format";
import { centsToBare } from "@/lib/cents-format";

const lines = [
  { currency: "PLN", cents: "12000" },
  { currency: "EUR", cents: "1500", equiv: { currency: "PLN", cents: "6400" } },
];

describe("formatReserveLines", () => {
  it("joins per-currency parts with the locale's conjunction (en)", () => {
    expect(formatReserveLines(lines, "en")).toBe(
      `${centsToBare("12000", "en")} PLN and ${centsToBare("1500", "en")} EUR (≈ ${centsToBare("6400", "en")} PLN)`,
    );
  });

  it("uses 'i' in Polish and 'і' in Ukrainian", () => {
    expect(formatReserveLines(lines, "pl")).toContain(" PLN i ");
    expect(formatReserveLines(lines, "uk")).toContain(" PLN і ");
  });

  it("a single line is just that part, no ≈ without an equivalent", () => {
    expect(formatReserveLines([{ currency: "PLN", cents: "7000" }], "en")).toBe(`${centsToBare("7000", "en")} PLN`);
  });
});
