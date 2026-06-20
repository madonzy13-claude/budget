/**
 * wallets-skeleton.test.tsx — the shared Wallets tab skeleton.
 *
 * It is the SINGLE waiting layout for the Wallets tab (client list + the BDP
 * loading.tsx). The `delayed` prop decides whether the whole block is wrapped in
 * `reveal-delayed` (invisible 200ms to bridge the async IDB restore). loading.tsx
 * and post-restore cold mounts pass `delayed={false}` so the skeleton paints
 * immediately instead of blanking the pane under the band.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { WalletsSkeleton } from "@/components/budgeting/wallets-tab/wallets-skeleton";

describe("WalletsSkeleton", () => {
  it("defaults to delayed (reveal-delayed bridges the IDB restore)", () => {
    const { container } = render(<WalletsSkeleton label="Spendings wallets" />);
    expect(container.querySelector(".reveal-delayed")).not.toBeNull();
  });

  it("delayed={false} renders immediately (no reveal-delayed, no empty window)", () => {
    const { container } = render(
      <WalletsSkeleton label="Spendings wallets" delayed={false} />,
    );
    expect(container.querySelector(".reveal-delayed")).toBeNull();
    // still the same skeleton content (header + carded rows).
    expect(
      container.querySelector(".bg-\\[var\\(--surface-card-dark\\)\\]"),
    ).not.toBeNull();
  });
});
