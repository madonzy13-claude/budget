/**
 * surplus-banner.test.tsx — Vitest+RTL tests for SurplusBanner.
 *
 * Phase 05 reserve rewrite: replaces MismatchChip. Direction drives the copy +
 * accent: TOPUP (internal>userDefined), WITHDRAW (internal<userDefined),
 * NONE (reconciled).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SurplusBanner } from "../../src/components/budgeting/reserves-tab/surplus-banner";

// next-intl mock echoes the key (+ interpolated vars) so we can assert which
// surplus string was selected.
vi.mock("next-intl", () => ({
  useTranslations:
    (ns?: string) => (key: string, vars?: Record<string, unknown>) =>
      vars
        ? `${ns ? `${ns}.` : ""}${key}:${JSON.stringify(vars)}`
        : `${ns ? `${ns}.` : ""}${key}`,
}));

describe("SurplusBanner", () => {
  it("TOPUP renders the top-up copy with the amount", () => {
    render(<SurplusBanner direction="TOPUP" amountFormatted="200 EUR" />);
    const banner = screen.getByTestId("reserves-surplus-banner");
    expect(banner).toHaveAttribute("data-direction", "TOPUP");
    expect(banner.textContent).toContain("surplus.topup");
    expect(banner.textContent).toContain("200 EUR");
  });

  it("WITHDRAW renders the withdraw copy with the amount", () => {
    render(<SurplusBanner direction="WITHDRAW" amountFormatted="450 EUR" />);
    const banner = screen.getByTestId("reserves-surplus-banner");
    expect(banner).toHaveAttribute("data-direction", "WITHDRAW");
    expect(banner.textContent).toContain("surplus.withdraw");
    expect(banner.textContent).toContain("450 EUR");
  });

  it("NONE renders the reconciled copy (no amount needed)", () => {
    render(<SurplusBanner direction="NONE" />);
    const banner = screen.getByTestId("reserves-surplus-banner");
    expect(banner).toHaveAttribute("data-direction", "NONE");
    expect(banner.textContent).toContain("surplus.reconciled");
  });

  it("has role=status so screen readers re-announce direction changes", () => {
    render(<SurplusBanner direction="TOPUP" amountFormatted="1 EUR" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });
});
