/**
 * home-offline-cache.test.tsx — Vitest+RTL tests for HomeOfflineCache client island.
 *
 * 260615-e8s Task 5 (corrected contract): HomeOfflineCache is a write-on-mount
 * side-effect that renders its {children} (the SERVER HomeCardsGrid) unchanged.
 * It writes the active-budgets list to IDB (+ __global__ sync-meta bump) when the
 * list is non-empty. The real cards are passed in as children (RSC slot) so no
 * server-only code enters the client bundle; the offline render of `/` is handled
 * by the SW nav-docs-v1 HTML cache, not a client-side cached-list branch.
 */
import "fake-indexeddb/auto";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Mock the only offline-cache helper the island uses.
const mockCacheActiveBudgets = vi.fn();
vi.mock("@/lib/offline-cache", () => ({
  cacheActiveBudgets: (...args: unknown[]) => mockCacheActiveBudgets(...args),
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
  mockCacheActiveBudgets.mockResolvedValue(undefined);
});

describe("HomeOfflineCache", () => {
  it("calls cacheActiveBudgets on mount when budgets is non-empty", async () => {
    const budgets = [makeBudget("b-1", "Family Budget")];
    render(
      <HomeOfflineCache budgets={budgets}>
        <div data-testid="home-cards-grid" />
      </HomeOfflineCache>,
    );
    await waitFor(() => {
      expect(mockCacheActiveBudgets).toHaveBeenCalledWith(budgets);
    });
  });

  it("does not call cacheActiveBudgets when budgets is empty", async () => {
    render(
      <HomeOfflineCache budgets={[]}>
        <div data-testid="home-cards-grid" />
      </HomeOfflineCache>,
    );
    // Give effects time to run.
    await new Promise((r) => setTimeout(r, 50));
    expect(mockCacheActiveBudgets).not.toHaveBeenCalled();
  });

  it("renders its children (the server budget grid) unchanged", async () => {
    render(
      <HomeOfflineCache budgets={[makeBudget("b-1", "Family Budget")]}>
        <div data-testid="home-cards-grid">cards</div>
      </HomeOfflineCache>,
    );
    expect(screen.getByTestId("home-cards-grid")).toBeTruthy();
  });
});
