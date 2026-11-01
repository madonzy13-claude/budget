/**
 * updated-ago.test.tsx — R6 (user): the small, faded "updated … ago" line.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { UpdatedAgo } from "../../src/components/budgeting/wallets-tab/updated-ago";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, p?: Record<string, string>) =>
    key === "value"
      ? `updated ${p?.when}`
      : key === "price"
        ? `price updated ${p?.when}`
        : "just now",
  useLocale: () => "en",
}));

describe("UpdatedAgo", () => {
  it("says when the amount changed, small and faded", () => {
    render(<UpdatedAgo at={new Date(Date.now() - 5 * 60_000).toISOString()} />);
    const line = screen.getByTestId("updated-ago");
    expect(line).toHaveTextContent("updated 5 minutes ago");
    expect(line.style.fontSize).toBe("10px");
    expect(Number(line.style.opacity)).toBeLessThanOrEqual(0.5);
  });

  it("a fetched price says so", () => {
    render(<UpdatedAgo at={new Date().toISOString()} kind="price" />);
    expect(screen.getByTestId("updated-ago")).toHaveTextContent(
      "price updated just now",
    );
  });

  it("renders nothing without a time", () => {
    const { container } = render(<UpdatedAgo at={null} />);
    expect(container.textContent).toBe("");
  });
});
