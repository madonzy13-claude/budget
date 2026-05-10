/**
 * fx-freshness-badge.test.tsx — Vitest+RTL component tests for FxFreshnessBadge.
 * Tests the "rate {age}" display using next-intl formatRelativeTime.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { FxFreshnessBadge } from "../../src/components/budgeting/fx-freshness-badge";

// Mock next-intl
// FxFreshnessBadge calls useTranslations("budgeting.fx"), so key is relative to that namespace.
vi.mock("next-intl", () => ({
  useFormatter: () => ({
    relativeTime: (_date: Date, _now: Date) => "2 hours ago",
  }),
  useTranslations: (_ns: string) =>
    (key: string, params?: Record<string, unknown>) => {
      // key "freshnessBadge" with { age: "2 hours ago" } → "rate 2 hours ago"
      if (key === "freshnessBadge" && params?.age) {
        return `rate ${params.age}`;
      }
      return key;
    },
}));

describe("FxFreshnessBadge", () => {
  it("renders with data-testid fx-freshness-badge", () => {
    render(<FxFreshnessBadge fxRateDate="2024-03-01" />);
    expect(screen.getByTestId("fx-freshness-badge")).toBeTruthy();
  });

  it("renders 'rate {age}' text using next-intl relativeTime", () => {
    render(<FxFreshnessBadge fxRateDate="2024-03-01" />);
    const badge = screen.getByTestId("fx-freshness-badge");
    // The mock useFormatter returns "2 hours ago" for relativeTime.
    // The t("budgeting.fx.freshnessBadge", { age }) returns "rate 2 hours ago".
    expect(badge.textContent).toContain("rate 2 hours ago");
  });

  it("renders provider suffix when provider prop is given", () => {
    render(<FxFreshnessBadge fxRateDate="2024-03-01" provider="frankfurter" />);
    const provider = screen.getByTestId("fx-freshness-provider");
    expect(provider.textContent).toContain("frankfurter");
  });

  it("does not render provider suffix when provider is omitted", () => {
    render(<FxFreshnessBadge fxRateDate="2024-03-01" />);
    const provider = document.querySelector(
      '[data-testid="fx-freshness-provider"]',
    );
    expect(provider).toBeNull();
  });

  it("applies custom className", () => {
    render(
      <FxFreshnessBadge fxRateDate="2024-03-01" className="custom-class" />,
    );
    const badge = screen.getByTestId("fx-freshness-badge");
    expect(badge.className).toContain("custom-class");
  });
});
