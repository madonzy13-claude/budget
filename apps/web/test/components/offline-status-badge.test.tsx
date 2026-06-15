/**
 * offline-status-badge.test.tsx — Vitest+RTL tests for OfflineStatusBadge.
 *
 * Mirrors the mock style in quick-entry-input.test.tsx: next-intl key-echo
 * useTranslations + a useFormatter stub returning a fixed relativeTime; mocks
 * @/lib/offline-cache getSyncMeta. navigator.onLine is set via
 * Object.defineProperty before each render.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { OfflineStatusBadge } from "../../src/components/common/offline-status-badge";

// getSyncMeta mock — default resolves an ISO ~13 minutes ago. Individual
// tests override with mockResolvedValueOnce(null) for the unknown branch.
const mockGetSyncMeta = vi.fn();
vi.mock("@/lib/offline-cache", () => ({
  getSyncMeta: (...args: unknown[]) => mockGetSyncMeta(...args),
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
// asserted text is queryable. Keep controlled open/onOpenChange semantics.
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
    mockGetSyncMeta.mockResolvedValue(
      new Date(Date.now() - 13 * 60 * 1000).toISOString(),
    );
  });

  afterEach(() => {
    setOnline(true);
  });

  it("online: renders sr-only span and NO globe (zero layout shift)", () => {
    setOnline(true);
    render(<OfflineStatusBadge budgetId="budget-1" />);
    const badge = screen.getByTestId("offline-status-badge");
    expect(badge.className).toContain("sr-only");
    expect(screen.queryByTestId("offline-globe")).toBeNull();
  });

  it("offline: renders a pulsing globe icon", () => {
    setOnline(false);
    render(<OfflineStatusBadge budgetId="budget-1" />);
    const globe = screen.getByTestId("offline-globe");
    expect(globe).toBeTruthy();
    // lucide Globe carries the lucide-globe class; the icon pulses.
    expect(globe.getAttribute("class") ?? "").toContain("animate-pulse");
  });

  it("offline: tooltip text includes the formatted relative cache age", async () => {
    setOnline(false);
    render(<OfflineStatusBadge budgetId="budget-1" />);
    await waitFor(() => {
      expect(screen.getByText(/13 minutes ago/)).toBeTruthy();
    });
  });

  it("offline + getSyncMeta null: tooltip uses the tooltipUnknown key", async () => {
    setOnline(false);
    mockGetSyncMeta.mockReset();
    mockGetSyncMeta.mockResolvedValue(null);
    render(<OfflineStatusBadge budgetId="budget-1" />);
    await waitFor(() => {
      expect(screen.getByText(/indicator\.tooltipUnknown/)).toBeTruthy();
    });
  });

  it("offline + null budgetId: tooltip uses tooltipUnknown (no getSyncMeta lookup)", async () => {
    setOnline(false);
    render(<OfflineStatusBadge budgetId={null} />);
    await waitFor(() => {
      expect(screen.getByText(/indicator\.tooltipUnknown/)).toBeTruthy();
    });
    expect(mockGetSyncMeta).not.toHaveBeenCalled();
  });

  it("tap-to-open: clicking the trigger toggles controlled tooltip open state", () => {
    setOnline(false);
    render(<OfflineStatusBadge budgetId="budget-1" />);
    const globe = screen.getByTestId("offline-globe");
    // The trigger is the globe's button ancestor.
    const trigger = globe.closest("button");
    expect(trigger).toBeTruthy();
    fireEvent.click(trigger!);
    // Controlled Root reflects the open state via the mock attribute.
    const root = trigger!.closest("[data-tooltip-open]");
    expect(root?.getAttribute("data-tooltip-open")).toBe("true");
  });
});
