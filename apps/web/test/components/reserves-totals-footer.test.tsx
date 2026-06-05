/**
 * reserves-totals-footer.test.tsx — Vitest+RTL tests for ReservesTotalsFooter.
 *
 * Phase 05 reserve rewrite: the footer now renders Σ internal vs Σ wallets +
 * the SurplusBanner (top-up / withdraw / reconciled) driven by `direction`.
 *
 * Coverage:
 * - direction NONE → reconciled banner
 * - direction TOPUP → top-up banner (internal > userDefined)
 * - direction WITHDRAW → withdraw banner (internal < userDefined)
 * - data-testid="reserves-totals-footer" present, not sticky
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ReservesTotalsFooter } from "../../src/components/budgeting/reserves-tab/reserves-totals-footer";

// ─── mock next-intl ──────────────────────────────────────────────────────────

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));

// ─── helpers ─────────────────────────────────────────────────────────────────

function renderFooter(
  direction: "TOPUP" | "WITHDRAW" | "NONE",
  surplusCents: string,
) {
  return render(
    <ReservesTotalsFooter
      internalCents="30000"
      userDefinedCents="30000"
      surplusCents={surplusCents}
      direction={direction}
      currency="EUR"
    />,
  );
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("ReservesTotalsFooter", () => {
  it("renders the reconciled surplus banner when direction is NONE", () => {
    renderFooter("NONE", "0");
    const banner = screen.getByTestId("reserves-surplus-banner");
    expect(banner).toBeInTheDocument();
    expect(banner).toHaveAttribute("data-direction", "NONE");
  });

  it("renders the top-up surplus banner when direction is TOPUP", () => {
    renderFooter("TOPUP", "-1500");
    expect(screen.getByTestId("reserves-surplus-banner")).toHaveAttribute(
      "data-direction",
      "TOPUP",
    );
  });

  it("renders the withdraw surplus banner when direction is WITHDRAW", () => {
    renderFooter("WITHDRAW", "2500");
    expect(screen.getByTestId("reserves-surplus-banner")).toHaveAttribute(
      "data-direction",
      "WITHDRAW",
    );
  });

  it("footer wrapper renders as bordered floating card (not sticky)", () => {
    renderFooter("NONE", "0");
    const footer = screen.getByTestId("reserves-totals-footer");
    expect(footer.className).not.toContain("sticky");
    expect(footer.className).toContain("rounded-[var(--radius-md)]");
    expect(footer.className).toContain("border");
  });

  it("renders the data-testid attribute", () => {
    renderFooter("NONE", "0");
    expect(screen.getByTestId("reserves-totals-footer")).toBeInTheDocument();
  });
});
