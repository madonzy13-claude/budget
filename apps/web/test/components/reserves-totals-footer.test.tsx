/**
 * reserves-totals-footer.test.tsx — Vitest+RTL tests for ReservesTotalsFooter.
 *
 * 05-19 reshape: the footer now renders 3 stacked totals and NO surplus banner:
 *   TOTAL AVAILABLE      (internalCents — Σ active reserve)
 *   TOTAL IN WALLETS     (userDefinedCents — Σ RESERVE-wallet balances)
 *   TOTAL USED (THIS MONTH)  (usedCents — Σ active rows' usedCents, passed in)
 *
 * The SurplusBanner (top-up / withdraw / reconciled) is GONE — the RESERVE_TOPUP
 * task card outside this component remains the single nudge surface.
 *
 * Coverage:
 * - data-testid="reserves-totals-footer" present, not sticky
 * - NO surplus banner rendered
 * - all three label keys render (internalLabel / walletsLabel / usedLabel)
 * - the used value cell renders the passed usedCents formatted as money
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
  overrides?: Partial<{
    internalCents: string;
    userDefinedCents: string;
    usedThisMonthCents: string;
    usedAllTimeCents: string;
    currency: string;
  }>,
) {
  return render(
    <ReservesTotalsFooter
      internalCents={overrides?.internalCents ?? "30000"}
      userDefinedCents={overrides?.userDefinedCents ?? "10000"}
      usedThisMonthCents={overrides?.usedThisMonthCents ?? "0"}
      usedAllTimeCents={overrides?.usedAllTimeCents ?? "0"}
      currency={overrides?.currency ?? "EUR"}
    />,
  );
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe("ReservesTotalsFooter (05-19 — 3 totals, no banner)", () => {
  it("does NOT render a surplus banner", () => {
    renderFooter();
    expect(
      screen.queryByTestId("reserves-surplus-banner"),
    ).not.toBeInTheDocument();
  });

  // TOTAL USED went (user, 260810): what a reserve has consumed over its life
  // is history, and the footer is about where the buffers stand now.
  it("does not report what has been used", () => {
    renderFooter();
    expect(screen.queryByTestId("reserves-total-used")).toBeNull();
    expect(screen.queryByTestId("reserves-total-used-alltime")).toBeNull();
  });

  it("renders the two total label keys", () => {
    renderFooter();
    const footer = screen.getByTestId("reserves-totals-footer");
    expect(footer.textContent).toContain("totals.internalLabel");
    expect(footer.textContent).toContain("totals.walletsLabel");
    expect(footer.textContent).not.toContain("totals.usedLabel");
  });

  it("renders TOTAL AVAILABLE value from internalCents", () => {
    renderFooter({ internalCents: "30000" });
    const footer = screen.getByTestId("reserves-totals-footer");
    expect(footer.textContent).toMatch(/300/);
  });

  it("renders TOTAL IN WALLETS value from userDefinedCents", () => {
    renderFooter({ userDefinedCents: "10000" });
    const footer = screen.getByTestId("reserves-totals-footer");
    expect(footer.textContent).toMatch(/100/);
  });




  it("footer wrapper renders as bordered floating card (not sticky)", () => {
    renderFooter();
    const footer = screen.getByTestId("reserves-totals-footer");
    expect(footer.className).not.toContain("sticky");
    expect(footer.className).toContain("rounded-[var(--radius-md)]");
    expect(footer.className).toContain("border");
  });

  it("renders the data-testid attribute", () => {
    renderFooter();
    expect(screen.getByTestId("reserves-totals-footer")).toBeInTheDocument();
  });

  // Arrow beside TOTAL IN WALLETS: wallet vs needed (= TOTAL AVAILABLE).
  it("wallet MORE than needed → green up arrow (no down)", () => {
    renderFooter({ internalCents: "10000", userDefinedCents: "30000" });
    expect(screen.getByTestId("reserves-wallets-arrow-up")).toBeInTheDocument();
    expect(
      screen.queryByTestId("reserves-wallets-arrow-down"),
    ).not.toBeInTheDocument();
  });

  it("wallet LESS than needed → red down arrow (no up)", () => {
    renderFooter({ internalCents: "30000", userDefinedCents: "10000" });
    expect(
      screen.getByTestId("reserves-wallets-arrow-down"),
    ).toBeInTheDocument();
    expect(
      screen.queryByTestId("reserves-wallets-arrow-up"),
    ).not.toBeInTheDocument();
  });

  it("wallet EQUALS needed → no arrow", () => {
    renderFooter({ internalCents: "20000", userDefinedCents: "20000" });
    expect(
      screen.queryByTestId("reserves-wallets-arrow-up"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId("reserves-wallets-arrow-down"),
    ).not.toBeInTheDocument();
  });

  it("totals block is right-aligned (ml-auto) and width-bounded", () => {
    renderFooter();
    const footer = screen.getByTestId("reserves-totals-footer");
    expect(footer.className).toContain("ml-auto");
    expect(footer.className).toContain("max-w-full");
  });
});
