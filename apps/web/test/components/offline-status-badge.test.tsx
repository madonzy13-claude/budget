/**
 * offline-status-badge.test.tsx — Vitest+RTL tests for OfflineStatusBadge.
 *
 * Mirrors the mock style in quick-entry-input.test.tsx: next-intl key-echo
 * useTranslations + a useFormatter stub returning a fixed relativeTime; mocks
 * @/lib/offline-cache getSyncMeta / getMostRecentSyncMeta. navigator.onLine is
 * set via Object.defineProperty before each render.
 *
 * 260615-d76 fixes covered here:
 *   1. No false flash on reload — isOnline inits true; offline only after a
 *      confirmed post-mount navigator.onLine===false or an 'offline' event.
 *   2. Icon is lucide CloudOff (crossed cloud), not Globe.
 *   3. budgetId null / per-budget miss → global "__global__" → most-recent
 *      fallback before tooltipUnknown.
 *   4. Tooltip side=bottom; tap toggles open→closed.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OfflineStatusBadge } from "../../src/components/common/offline-status-badge";

// offline-cache mocks — per-budget + global + most-recent fallback chain.
const mockGetSyncMeta = vi.fn();
const mockGetMostRecentSyncMeta = vi.fn();
vi.mock("@/lib/offline-cache", () => ({
  getSyncMeta: (...args: unknown[]) => mockGetSyncMeta(...args),
  getMostRecentSyncMeta: (...args: unknown[]) =>
    mockGetMostRecentSyncMeta(...args),
}));

// next-intl key-echo + a fixed relativeTime formatter.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, params?: Record<string, unknown>) => {
    if (params) return `${key}(${JSON.stringify(params)})`;
    return key;
  },
  useFormatter: () => ({ relativeTime: () => "13 minutes ago" }),
}));

// Radix Tooltip portals to document.body; render the content inline so the
// asserted text + side prop are queryable. Keep controlled open/onOpenChange.
vi.mock("@radix-ui/react-tooltip", () => {
  const React = require("react");
  return {
    Provider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Root: ({
      children,
      open,
      onOpenChange,
    }: {
      children: React.ReactNode;
      open?: boolean;
      onOpenChange?: (o: boolean) => void;
    }) =>
      React.createElement(
        "div",
        {
          "data-tooltip-open": open ? "true" : "false",
          "data-on-change": onOpenChange ? "1" : "0",
        },
        children,
      ),
    Trigger: ({
      children,
      asChild,
      ...props
    }: {
      children: React.ReactNode;
      asChild?: boolean;
    }) =>
      asChild ? (
        React.cloneElement(children as React.ReactElement, props)
      ) : (
        <button {...props}>{children}</button>
      ),
    Portal: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Content: ({ children, ...props }: { children: React.ReactNode }) => (
      <div {...props}>{children}</div>
    ),
  };
});

function setOnline(value: boolean) {
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value,
  });
}

describe("OfflineStatusBadge", () => {
  beforeEach(() => {
    mockGetSyncMeta.mockReset();
    mockGetMostRecentSyncMeta.mockReset();
    mockGetSyncMeta.mockResolvedValue(
      new Date(Date.now() - 13 * 60 * 1000).toISOString(),
    );
    mockGetMostRecentSyncMeta.mockResolvedValue(
      new Date(Date.now() - 13 * 60 * 1000).toISOString(),
    );
  });

  afterEach(() => {
    setOnline(true);
  });

  it("online: renders sr-only span and NO cloud-off (zero layout shift)", () => {
    setOnline(true);
    render(<OfflineStatusBadge budgetId="budget-1" />);
    const badge = screen.getByTestId("offline-status-badge");
    expect(badge.className).toContain("sr-only");
    expect(screen.queryByTestId("offline-cloud-off")).toBeNull();
  });

  // Fix 1: even when navigator.onLine is briefly false during reload, an
  // online machine must NOT flash the indicator. The component inits isOnline
  // true and only flips offline after a post-mount confirmed offline reading.
  it("no false flash: online machine never shows the indicator after mount", async () => {
    setOnline(true);
    render(<OfflineStatusBadge budgetId="budget-1" />);
    // Let the post-mount effect run (it reads the REAL navigator.onLine).
    await waitFor(() => {
      const badge = screen.getByTestId("offline-status-badge");
      expect(badge.className).toContain("sr-only");
    });
    expect(screen.queryByTestId("offline-cloud-off")).toBeNull();
  });

  // Fix 1: confirmed-offline navigator.onLine===false at mount → after the
  // post-mount effect reads it, the indicator appears.
  it("post-mount confirmed offline (navigator.onLine===false) shows the indicator", async () => {
    setOnline(false);
    render(<OfflineStatusBadge budgetId="budget-1" />);
    await waitFor(() => {
      expect(screen.getByTestId("offline-cloud-off")).toBeTruthy();
    });
  });

  // Fix 2: icon is lucide Unplug (pulsing). testid kept stable (offline-cloud-off)
  // to avoid churn in assertions across the test suite.
  it("offline: renders a pulsing Unplug icon", async () => {
    setOnline(false);
    render(<OfflineStatusBadge budgetId="budget-1" />);
    await waitFor(() => {
      const icon = screen.getByTestId("offline-cloud-off");
      expect(icon).toBeTruthy();
      expect(icon.getAttribute("class") ?? "").toContain("animate-pulse");
      // lucide Unplug carries the lucide-unplug class (not lucide-cloud-off).
      expect(icon.getAttribute("class") ?? "").toContain("lucide-unplug");
    });
    // No Globe anymore.
    expect(screen.queryByTestId("offline-globe")).toBeNull();
  });

  it("offline: tooltip text includes the formatted relative cache age", async () => {
    setOnline(false);
    render(<OfflineStatusBadge budgetId="budget-1" />);
    await waitFor(() => {
      expect(screen.getByText(/13 minutes ago/)).toBeTruthy();
    });
  });

  // Fix 4: tooltip renders BELOW the icon (side=bottom).
  it("offline: tooltip content renders with side=bottom", async () => {
    setOnline(false);
    render(<OfflineStatusBadge budgetId="budget-1" />);
    await waitFor(() => {
      const content = screen.getByText(/13 minutes ago/);
      expect(content.getAttribute("side")).toBe("bottom");
    });
  });

  it("offline + getSyncMeta null + global null + most-recent null: tooltipUnknown", async () => {
    setOnline(false);
    mockGetSyncMeta.mockReset();
    mockGetSyncMeta.mockResolvedValue(null);
    mockGetMostRecentSyncMeta.mockReset();
    mockGetMostRecentSyncMeta.mockResolvedValue(null);
    render(<OfflineStatusBadge budgetId="budget-1" />);
    await waitFor(() => {
      expect(screen.getByText(/indicator\.tooltipUnknown/)).toBeTruthy();
    });
  });

  // Fix 3: null budgetId falls back to the global "__global__" sync-meta, then
  // most-recent — it must show a real relative age, not tooltipUnknown.
  it("offline + null budgetId: falls back to global sync-meta (real age, not unknown)", async () => {
    setOnline(false);
    // Per-budget lookup keyed "__global__" returns a real iso.
    mockGetSyncMeta.mockReset();
    mockGetSyncMeta.mockImplementation((key: string) =>
      key === "__global__"
        ? Promise.resolve(new Date(Date.now() - 13 * 60 * 1000).toISOString())
        : Promise.resolve(null),
    );
    render(<OfflineStatusBadge budgetId={null} />);
    await waitFor(() => {
      expect(screen.getByText(/13 minutes ago/)).toBeTruthy();
    });
    // It should have queried the global key.
    expect(mockGetSyncMeta).toHaveBeenCalledWith("__global__");
  });

  // Fix 3: per-budget miss → global → most-recent fallback.
  it("offline + per-budget miss: falls through global then most-recent", async () => {
    setOnline(false);
    mockGetSyncMeta.mockReset();
    mockGetSyncMeta.mockResolvedValue(null); // per-budget AND global both null
    mockGetMostRecentSyncMeta.mockReset();
    mockGetMostRecentSyncMeta.mockResolvedValue(
      new Date(Date.now() - 13 * 60 * 1000).toISOString(),
    );
    render(<OfflineStatusBadge budgetId="budget-1" />);
    await waitFor(() => {
      expect(screen.getByText(/13 minutes ago/)).toBeTruthy();
    });
    expect(mockGetMostRecentSyncMeta).toHaveBeenCalled();
  });

  // Fix 4: tap toggles open → a second tap CLOSES (no reopen flicker).
  it("tap-to-close: clicking the trigger toggles controlled tooltip open then closed", async () => {
    setOnline(false);
    render(<OfflineStatusBadge budgetId="budget-1" />);
    let icon: HTMLElement;
    await waitFor(() => {
      icon = screen.getByTestId("offline-cloud-off");
    });
    const trigger = icon!.closest("button");
    expect(trigger).toBeTruthy();
    const root = trigger!.closest("[data-tooltip-open]");
    // Initially closed.
    expect(root?.getAttribute("data-tooltip-open")).toBe("false");
    // First tap opens.
    fireEvent.click(trigger!);
    expect(root?.getAttribute("data-tooltip-open")).toBe("true");
    // Second tap closes (reliably, no reopen).
    fireEvent.click(trigger!);
    expect(root?.getAttribute("data-tooltip-open")).toBe("false");
  });
});
