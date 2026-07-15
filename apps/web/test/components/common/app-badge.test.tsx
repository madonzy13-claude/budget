/**
 * app-badge.test.tsx — the PWA app-icon badge sums pending tasks across ALL budgets
 * (r31 item 2). Uses the Badging API; here we shim navigator.setAppBadge/clearAppBadge.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// r37: AppBadge fetches each budget's BADGE opt-in pref (opt-in, default OFF).
const getPrefs = vi.fn();
vi.mock("@/lib/api-client", () => ({
  api: { push: { preferences: { $get: (...a: unknown[]) => getPrefs(...a) } } },
}));

vi.mock("@/hooks/use-active-budgets", () => ({ useActiveBudgets: vi.fn() }));
import { useActiveBudgets } from "@/hooks/use-active-budgets";
import { AppBadge, isPendingTasksUpdate } from "@/components/common/app-badge";

// AppBadge calls useQueryClient() → needs a provider.
const renderBadge = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AppBadge />
    </QueryClientProvider>,
  );

describe("isPendingTasksUpdate", () => {
  const ev = (over: Record<string, unknown>) => ({
    type: "updated",
    action: { type: "success" },
    query: { queryKey: ["tasks", "b1", "pending"] },
    ...over,
  });
  it("is true when a pending-tasks query settles with fresh data", () => {
    expect(isPendingTasksUpdate(ev({}))).toBe(true);
  });
  it("ignores non-tasks queries", () => {
    expect(
      isPendingTasksUpdate(ev({ query: { queryKey: ["budget", "b1"] } })),
    ).toBe(false);
  });
  it("ignores tasks queries that are not the pending list", () => {
    expect(
      isPendingTasksUpdate(ev({ query: { queryKey: ["tasks", "b1", "all"] } })),
    ).toBe(false);
  });
  it("ignores in-flight (non-success) updates", () => {
    expect(isPendingTasksUpdate(ev({ action: { type: "fetch" } }))).toBe(false);
  });
  it("ignores non-update events (added/removed)", () => {
    expect(isPendingTasksUpdate(ev({ type: "added" }))).toBe(false);
  });
});

const setAppBadge = vi.fn(() => Promise.resolve());
const clearAppBadge = vi.fn(() => Promise.resolve());

beforeEach(() => {
  vi.clearAllMocks();
  // @ts-expect-error test shim for the Badging API
  navigator.setAppBadge = setAppBadge;
  // @ts-expect-error test shim for the Badging API
  navigator.clearAppBadge = clearAppBadge;
  // Default: every budget has opted IN to the badge.
  getPrefs.mockResolvedValue({
    ok: true,
    json: async () => ({
      preferences: [{ notificationType: "BADGE", enabled: true }],
    }),
  });
});

const mockBudgets = (data: unknown) =>
  (useActiveBudgets as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
    data,
  });

describe("AppBadge", () => {
  it("sets the badge to the SUM of pending tasks across OPTED-IN budgets", async () => {
    mockBudgets([
      { id: "b1", pendingTasksCount: 7 },
      { id: "b2", pendingTasksCount: 4 },
      { id: "b3", pendingTasksCount: 0 },
    ]);
    renderBadge();
    await waitFor(() => expect(setAppBadge).toHaveBeenCalledWith(11));
    expect(clearAppBadge).not.toHaveBeenCalled();
  });

  it("clears the badge when no budget has opted in (badge is opt-in)", async () => {
    getPrefs.mockResolvedValue({
      ok: true,
      json: async () => ({ preferences: [] }), // no BADGE pref → OFF
    });
    mockBudgets([
      { id: "b1", pendingTasksCount: 7 },
      { id: "b2", pendingTasksCount: 4 },
    ]);
    renderBadge();
    await waitFor(() => expect(clearAppBadge).toHaveBeenCalled());
    expect(setAppBadge).not.toHaveBeenCalled();
  });

  it("clears the badge when opted-in budgets have zero pending", async () => {
    mockBudgets([
      { id: "b1", pendingTasksCount: 0 },
      { id: "b2", pendingTasksCount: 0 },
    ]);
    renderBadge();
    await waitFor(() => expect(clearAppBadge).toHaveBeenCalled());
    expect(setAppBadge).not.toHaveBeenCalled();
  });

  it("no-ops while the budgets are still loading (data undefined)", () => {
    mockBudgets(undefined);
    renderBadge();
    expect(setAppBadge).not.toHaveBeenCalled();
    expect(clearAppBadge).not.toHaveBeenCalled();
  });
});
