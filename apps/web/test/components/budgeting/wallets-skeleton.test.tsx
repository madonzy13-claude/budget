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
  it("defaults to delayed: block + inner bars hidden 200ms (bridges IDB restore)", () => {
    const { container } = render(<WalletsSkeleton label="Spendings wallets" />);
    expect(container.querySelector(".reveal-delayed")).not.toBeNull();
    // inner bars use the delayed (hidden-200ms) variant too.
    expect(container.querySelector(".skeleton-delayed")).not.toBeNull();
    expect(container.querySelector(".skeleton-immediate")).toBeNull();
  });

  it("delayed={false} renders immediately: block AND inner bars visible from frame 0", () => {
    const { container } = render(
      <WalletsSkeleton label="Spendings wallets" delayed={false} />,
    );
    expect(container.querySelector(".reveal-delayed")).toBeNull();
    // inner bars must also be immediate — otherwise the cards show empty 200ms.
    expect(container.querySelector(".skeleton-delayed")).toBeNull();
    expect(container.querySelector(".skeleton-immediate")).not.toBeNull();
    // still the same skeleton content (header + carded rows).
    expect(
      container.querySelector(".bg-\\[var\\(--surface-card-dark\\)\\]"),
    ).not.toBeNull();
  });
});
