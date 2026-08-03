/**
 * planned-totals.test.tsx — the three figures the Planned section opens on (260803).
 *
 * Spent, the reserve it drew, and what went over. The two parts only colour when
 * there is something to colour, so a clean range does not read as a warning.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

const { PlannedTotals } = await import(
  "@/components/budgeting/overview/planned-totals"
);

const fmt = (c: bigint) => `${Number(c) / 100} zl`;

const renderTotals = (
  props: Partial<Parameters<typeof PlannedTotals>[0]> = {},
) =>
  render(
    <PlannedTotals
      spentCents="70000"
      reserveUsedCents="0"
      overspentCents="20000"
      format={fmt}
      {...props}
    />,
  ).container;

describe("PlannedTotals", () => {
  it("shows what was spent, drawn from reserve, and overspent", () => {
    renderTotals();
    expect(screen.getByTestId("planned-total-spent").textContent).toBe("700 zl");
    expect(screen.getByTestId("planned-total-reserve").textContent).toBe("0 zl");
    expect(screen.getByTestId("planned-total-overspent").textContent).toBe(
      "200 zl",
    );
  });

  it("colours an overspend", () => {
    renderTotals({ overspentCents: "20000" });
    expect(
      screen.getByTestId("planned-total-overspent").getAttribute("style") ?? "",
    ).toContain("--trading-down");
  });

  it("leaves a clean range uncoloured — zero is not a warning", () => {
    renderTotals({ overspentCents: "0", reserveUsedCents: "0" });
    for (const k of ["overspent", "reserve"])
      expect(
        screen.getByTestId(`planned-total-${k}`).getAttribute("style"),
      ).toBeFalsy();
  });

  it("colours the reserve only once something was drawn", () => {
    renderTotals({ reserveUsedCents: "5000" });
    expect(
      screen.getByTestId("planned-total-reserve").getAttribute("style") ?? "",
    ).toContain("--primary");
  });

  it("drops the reserve figure when the feature is off", () => {
    renderTotals({ reservesEnabled: false });
    expect(screen.queryByTestId("planned-total-reserve")).toBeNull();
    expect(screen.getByTestId("planned-total-spent")).toBeTruthy();
  });

  it("reads a missing figure as zero rather than throwing", () => {
    renderTotals({ spentCents: "" });
    expect(screen.getByTestId("planned-total-spent").textContent).toBe("0 zl");
  });
});
