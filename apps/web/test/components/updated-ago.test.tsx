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
  it("says how long ago, short, with a refresh mark — hung under the amount", () => {
    render(<UpdatedAgo at={new Date(Date.now() - 5 * 60_000).toISOString()} />);
    const line = screen.getByTestId("updated-ago");
    // F9 (user): "↻ 5m ago" under the amount, which stays where it is.
    expect(line).toHaveTextContent(/^5m ago$/);
    expect(line.querySelector("svg")).not.toBeNull();
    expect(line.className).toContain("absolute");
    expect(line.getAttribute("title")).toBe("updated 5 minutes ago");
    expect(line.style.fontSize).toBe("9px");
    expect(Number(line.style.opacity)).toBeLessThanOrEqual(0.5);
  });

  it("a fetched price says so", () => {
    render(<UpdatedAgo at={new Date().toISOString()} kind="price" />);
    expect(screen.getByTestId("updated-ago")).toHaveTextContent("just now");
    expect(screen.getByTestId("updated-ago")).toHaveAttribute(
      "title",
      "price updated just now",
    );
  });

  it("renders nothing without a time", () => {
    const { container } = render(<UpdatedAgo at={null} />);
    expect(container.textContent).toBe("");
  });

  // R6 (user): a typed amount shows a pen, an automatic price the ↻ mark.
  it("a typed amount carries a pen, a fetched price the refresh mark", () => {
    const { unmount } = render(
      <UpdatedAgo at={new Date().toISOString()} kind="value" />,
    );
    expect(screen.getByTestId("updated-ago")).toHaveAttribute(
      "data-icon",
      "pen",
    );
    unmount();
    render(<UpdatedAgo at={new Date().toISOString()} kind="price" />);
    expect(screen.getByTestId("updated-ago")).toHaveAttribute(
      "data-icon",
      "reload",
    );
  });
});
