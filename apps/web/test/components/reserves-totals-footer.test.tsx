/**
 * reserves-totals-footer.test.tsx — Vitest+RTL tests for ReservesTotalsFooter.
 *
 * Coverage:
 * - mismatchCents="0" → reconciled chip
 * - mismatchCents="1500" → overfunded chip
 * - mismatchCents="-2500" → underfunded chip
 * - Sticky positioning: wrapper has "sticky" + "bottom-0" classes
 * - data-testid="reserves-totals-footer" present
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReservesTotalsFooter } from "../../src/components/budgeting/reserves-tab/reserves-totals-footer";

// ─── mock next-intl ──────────────────────────────────────────────────────────

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// ─── helpers ─────────────────────────────────────────────────────────────────

function renderFooter(mismatchCents: string) {
  return render(
    <ReservesTotalsFooter
      totalCategoryCents="30000"
      totalWalletCents="30000"
      mismatchCents={mismatchCents}
      currency="EUR"
    />,
  );
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("ReservesTotalsFooter", () => {
  it("renders reconciled MismatchChip when mismatchCents is '0'", () => {
    renderFooter("0");
    // MismatchChip reconciled has data-testid="mismatch-chip-reconciled"
    expect(screen.getByTestId("mismatch-chip-reconciled")).toBeInTheDocument();
  });

  it("renders overfunded MismatchChip when mismatchCents is positive", () => {
    renderFooter("1500");
    expect(screen.getByTestId("mismatch-chip-overfunded")).toBeInTheDocument();
  });

  it("renders underfunded MismatchChip when mismatchCents is negative", () => {
    renderFooter("-2500");
    expect(screen.getByTestId("mismatch-chip-underfunded")).toBeInTheDocument();
  });

  it("footer wrapper renders as bordered floating card (T3-45: not sticky)", () => {
    renderFooter("0");
    const footer = screen.getByTestId("reserves-totals-footer");
    expect(footer.className).not.toContain("sticky");
    expect(footer.className).toContain("rounded-[var(--radius-md)]");
    expect(footer.className).toContain("border");
  });

  it("renders the data-testid attribute", () => {
    renderFooter("0");
    expect(screen.getByTestId("reserves-totals-footer")).toBeInTheDocument();
  });
});
