import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { OfflineStaleBar } from "../../src/components/common/offline-stale-bar";

vi.mock("next/navigation", () => ({
  usePathname: () => "/en",
  useSearchParams: () => new URLSearchParams(""),
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vals?: Record<string, unknown>) =>
    vals ? `${key} ${Object.values(vals).join(" ")}` : key,
  useFormatter: () => ({ relativeTime: () => "5 minutes ago" }),
}));
vi.mock("../../src/hooks/use-cache-age", () => ({
  useCacheAge: () => ({ kind: "unknown" }),
}));

let mockStatus: "online" | "offline" | "server-down" = "server-down";
vi.mock("../../src/components/common/connectivity-provider", () => ({
  useConnectivity: () => ({
    status: mockStatus,
    degraded: mockStatus !== "online",
    reason: mockStatus,
  }),
}));

describe("OfflineStaleBar — server-down", () => {
  it("renders the server-down banner copy when status is server-down", () => {
    mockStatus = "server-down";
    render(<OfflineStaleBar budgetId={null} />);
    expect(screen.getByTestId("offline-stale-bar").textContent).toContain(
      "serverDown.banner.unknown",
    );
  });

  it("renders the offline banner copy when status is offline", () => {
    mockStatus = "offline";
    render(<OfflineStaleBar budgetId={null} />);
    expect(screen.getByTestId("offline-stale-bar").textContent).toContain(
      "offline.staleBar.unknown",
    );
  });

  it("renders nothing when online", () => {
    mockStatus = "online";
    const { container } = render(<OfflineStaleBar budgetId={null} />);
    expect(
      container.querySelector('[data-testid="offline-stale-bar"]'),
    ).toBeNull();
  });
});
