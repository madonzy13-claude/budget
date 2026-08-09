/**
 * column-header-limit-used.test.tsx — the limit can only be used up to the
 * limit (user screenshot, 260809).
 *
 * The header reads "used / limit". Over-spending a 1,100 limit by 2,267 drew
 * "3,367 / 1,100", which says a limit was used three times over — it cannot
 * be. Everything past the limit comes out of the reserve, and past that it is
 * overspend; both already have their own rows underneath. So the numerator
 * stops at the limit.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

import { ColumnHeader } from "@/components/budgeting/spendings-grid/column-header";

const category = {
  id: "cat-car",
  name: "Car",
  iconKey: null,
  colorKey: "blue",
  sortIndex: 0,
};

const summary = (over: Record<string, string> = {}) => ({
  plannedCents: "110000",
  cushionCents: "80000",
  activeBudgetCents: "110000",
  spentCents: "336700",
  reserveUsedCents: "226700",
  reserveAvailableCents: "0",
  reserveExcluded: false,
  overspentCents: "0",
  balanceCents: "0",
  isInvestment: false,
  ...over,
});

const used = (cushion = false, s = summary()) => {
  render(
    <ColumnHeader
      category={category}
      summary={s as never}
      cushionModeEnabled={cushion}
      onEdit={() => {}}
    />,
  );
  return screen.getByTestId("column-header-car-planned").textContent ?? "";
};

describe("limit used", () => {
  it("stops at the limit rather than reporting three times it", () => {
    expect(used()).toBe("1,100 / 1,100");
  });

  it("reads normally while the limit still has room", () => {
    expect(used(false, summary({ spentCents: "40000" }))).toBe("400 / 1,100");
  });

  it("caps against the CUSHION limit when that is the one on show", () => {
    // Cushion months are judged against the cushion figure, so that is what
    // the spend can fill.
    expect(used(true)).toBe("800 / 800");
  });

  it("nothing spent is still nothing", () => {
    expect(used(false, summary({ spentCents: "0" }))).toBe("0 / 1,100");
  });
});
