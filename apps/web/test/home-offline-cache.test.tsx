/**
 * home-offline-cache.test.tsx — Vitest+RTL tests for HomeOfflineCache client island.
 *
 * 260615-e8s Task 5: HomeOfflineCache writes the budget list on mount (when
 * budgets.length > 0) and renders a lightweight offline list when offline+empty.
 *
 * Uses fake-indexeddb + mocked cacheActiveBudgets/getCachedActiveBudgets.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Mock IDB helpers — deterministic per test
const mockCacheActiveBudgets = vi.fn();
const mockGetCachedActiveBudgets = vi.fn();
vi.mock("@/lib/offline-cache", () => ({
  cacheActiveBudgets: (...args: unknown[]) => mockCacheActiveBudgets(...args),
  getCachedActiveBudgets: (...args: unknown[]) =>
    mockGetCachedActiveBudgets(...args),
  // Other exports used by transitive imports
  getSyncMeta: vi.fn().mockResolvedValue(null),
  getMostRecentSyncMeta: vi.fn().mockResolvedValue(null),
  setCachedEntities: vi.fn().mockResolvedValue(undefined),
  bumpGlobalSyncMeta: vi.fn().mockResolvedValue(undefined),
}));

// next-intl key-echo
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useFormatter: () => ({ relativeTime: () => "1 minute ago" }),
}));

// HomeCardsGrid is a server component with async children (BudgetCard) — render
// a stub so HomeOfflineCache can render it client-side without RSC dependencies.
vi.mock("@/components/budgeting/home-cards-grid", () => ({
  HomeCardsGrid: ({
    budgets,
  }: {
    budgets: Array<{ id: string; name: string }>;
  }) => (
    <div data-testid="home-cards-grid">
      {budgets.map((b) => (
        <div key={b.id} data-testid={`budget-card-${b.id}`}>
          {b.name}
        </div>
      ))}
    </div>
  ),
}));

import type { BudgetSummary } from "@/components/budgeting/budget-switcher";
import { HomeOfflineCache } from "@/components/budgeting/home-offline-cache";

function makeBudget(id: string, name: string): BudgetSummary {
  return {
    id,
    name,
    kind: "PRIVATE",
    default_currency: "USD",
    pendingTasksCount: 0,
  };
}

beforeEach(() => {
  mockCacheActiveBudgets.mockReset();
  mockGetCachedActiveBudgets.mockReset();
  mockCacheActiveBudgets.mockResolvedValue(undefined);
  mockGetCachedActiveBudgets.mockResolvedValue([]);
});

describe("HomeOfflineCache", () => {
  it("calls cacheActiveBudgets on mount when budgets is non-empty", async () => {
    const budgets = [makeBudget("b-1", "Family Budget")];
    render(<HomeOfflineCache budgets={budgets} locale="en" />);
    await waitFor(() => {
      expect(mockCacheActiveBudgets).toHaveBeenCalledWith(budgets);
    });
  });

  it("does not call cacheActiveBudgets when budgets is empty", async () => {
    render(<HomeOfflineCache budgets={[]} locale="en" />);
    // Give effects time to run
    await new Promise((r) => setTimeout(r, 50));
    expect(mockCacheActiveBudgets).not.toHaveBeenCalled();
  });

  it("renders HomeCardsGrid with budgets when list is non-empty", async () => {
    const budgets = [
      makeBudget("b-1", "Family Budget"),
      makeBudget("b-2", "Side Project"),
    ];
    render(<HomeOfflineCache budgets={budgets} locale="en" />);
    await waitFor(() => {
      expect(screen.getByTestId("budget-card-b-1")).toBeTruthy();
      expect(screen.getByTestId("budget-card-b-2")).toBeTruthy();
    });
  });

  it("reads getCachedActiveBudgets and renders them when server list is empty", async () => {
    const cachedList = [makeBudget("b-cached", "Cached Budget")];
    mockGetCachedActiveBudgets.mockResolvedValue(cachedList);

    render(<HomeOfflineCache budgets={[]} locale="en" />);

    await waitFor(() => {
      expect(mockGetCachedActiveBudgets).toHaveBeenCalled();
      expect(screen.getByTestId("budget-card-b-cached")).toBeTruthy();
    });
  });

  it("renders nothing extra (no duplicate grid) when server list is non-empty", async () => {
    const budgets = [makeBudget("b-1", "Family Budget")];
    render(<HomeOfflineCache budgets={budgets} locale="en" />);
    await waitFor(() => {
      // Only ONE grid rendered (not two)
      expect(screen.getAllByTestId("home-cards-grid")).toHaveLength(1);
    });
  });
});
