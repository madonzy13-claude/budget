/**
 * bdp-tabs.test.tsx — Vitest + RTL coverage for the BdpTabs client component.
 *
 * Mocks next/navigation usePathname and next-intl useTranslations so the test
 * focuses on routing-driven active state, aria semantics, mobile-collapse class
 * presence, and route-as-tab anchors (BDP-05 / D-PH3-04).
 */
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { TestQueryProvider } from "../../setup/query-client";

// usePathname is mocked per-test below by re-assigning this variable.
let mockPathname = "/en/budgets/abc/spendings";

vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));

vi.mock("next-intl", () => ({
  useTranslations: (_ns: string) => (key: string) => {
    const map: Record<string, string> = {
      aria: "Budget detail tabs",
      "spendings.label": "Spendings",
      "reserves.label": "Reserves",
      "wallets.label": "Wallets",
      "settings.label": "Settings",
    };
    return map[key] ?? key;
  },
}));

// clientApiFetch mocked — badge tests control data via initialTasks prop,
// so the queryFn never fires in tests.
vi.mock("@/lib/budget-fetch", () => ({
  clientApiFetch: vi.fn().mockResolvedValue({ ok: false }),
}));

import { BdpTabs } from "@/components/budgeting/bdp-tabs";
import type { TaskSummary } from "@/components/budgeting/task-banner-row";

// Wrap renders in QueryClientProvider because BdpTabs now uses useQuery.
function renderTabs(props: Parameters<typeof BdpTabs>[0]) {
  return render(
    <TestQueryProvider>
      <BdpTabs {...props} />
    </TestQueryProvider>,
  );
}

describe("BdpTabs", () => {
  // UAT-PH5-T2-02: pill order reordered — Wallets first per user feedback.
  it("renders 4 Link elements in order: Wallets, Spendings, Reserves, Settings", () => {
    mockPathname = "/en/budgets/abc/wallets";
    renderTabs({ locale: "en", budgetId: "abc" });
    const links = screen.getAllByRole("link");
    expect(links.length).toBe(4);
    const labels = links.map((l) => l.getAttribute("aria-label"));
    expect(labels).toEqual(["Wallets", "Spendings", "Reserves", "Settings"]);
  });

  it('active pill has aria-current="page" when pathname matches its href', () => {
    mockPathname = "/en/budgets/abc/reserves";
    renderTabs({ locale: "en", budgetId: "abc" });
    const reserves = screen.getByRole("link", { name: "Reserves" });
    expect(reserves.getAttribute("aria-current")).toBe("page");
  });

  it("default pathname /en/budgets/abc/spendings → Spendings has aria-current; others do not", () => {
    mockPathname = "/en/budgets/abc/spendings";
    renderTabs({ locale: "en", budgetId: "abc" });
    const spendings = screen.getByRole("link", { name: "Spendings" });
    const reserves = screen.getByRole("link", { name: "Reserves" });
    const wallets = screen.getByRole("link", { name: "Wallets" });
    const settings = screen.getByRole("link", { name: "Settings" });
    expect(spendings.getAttribute("aria-current")).toBe("page");
    expect(reserves.getAttribute("aria-current")).toBeNull();
    expect(wallets.getAttribute("aria-current")).toBeNull();
    expect(settings.getAttribute("aria-current")).toBeNull();
  });

  it("pathname /en/budgets/abc/wallets → Wallets has aria-current AND yellow primary bg class", () => {
    mockPathname = "/en/budgets/abc/wallets";
    renderTabs({ locale: "en", budgetId: "abc" });
    const wallets = screen.getByRole("link", { name: "Wallets" });
    expect(wallets.getAttribute("aria-current")).toBe("page");
    expect(wallets.className).toMatch(/bg-\[var\(--primary\)\]/);
    expect(wallets.className).toMatch(/text-\[var\(--on-primary\)\]/);
  });

  it("each pill is an <a> anchor element (route-as-tab — BDP-05 / D-PH3-04), not <button>", () => {
    mockPathname = "/en/budgets/abc/spendings";
    renderTabs({ locale: "en", budgetId: "abc" });
    const links = screen.getAllByRole("link");
    links.forEach((l) => expect(l.tagName).toBe("A"));
    // No <button> tabs.
    expect(screen.queryAllByRole("button").length).toBe(0);
  });

  it("each pill carries aria-label resolved from t(`${slug}.label`)", () => {
    mockPathname = "/en/budgets/abc/spendings";
    renderTabs({ locale: "en", budgetId: "abc" });
    expect(screen.getByRole("link", { name: "Spendings" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Reserves" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Wallets" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
  });

  // D-PH5-R11: cascading-hide surface 1 — reservesEnabled prop
  describe("reservesEnabled cascading-hide (D-PH5-R11 surface 1)", () => {
    it("no prop (undefined) → defaults to true → renders all 4 pills including Reserves", () => {
      mockPathname = "/en/budgets/abc/spendings";
      renderTabs({ locale: "en", budgetId: "abc" });
      const links = screen.getAllByRole("link");
      expect(links.length).toBe(4);
      expect(screen.getByRole("link", { name: "Reserves" })).toBeTruthy();
    });

    it("reservesEnabled={true} → renders all 4 pills including Reserves", () => {
      mockPathname = "/en/budgets/abc/spendings";
      renderTabs({ locale: "en", budgetId: "abc", reservesEnabled: true });
      const links = screen.getAllByRole("link");
      expect(links.length).toBe(4);
      expect(screen.getByRole("link", { name: "Reserves" })).toBeTruthy();
    });

    it("reservesEnabled={false} → renders 3 pills in order Wallets, Spendings, Settings", () => {
      mockPathname = "/en/budgets/abc/spendings";
      renderTabs({ locale: "en", budgetId: "abc", reservesEnabled: false });
      const links = screen.getAllByRole("link");
      expect(links.length).toBe(3);
      const labels = links.map((l) => l.getAttribute("aria-label"));
      expect(labels).toEqual(["Wallets", "Spendings", "Settings"]);
      expect(labels).not.toContain("Reserves");
      expect(screen.queryByRole("link", { name: "Reserves" })).toBeNull();
    });

    it("reservesEnabled={false} + activeSlug=reserves → does not crash; no pill is active-current", () => {
      mockPathname = "/en/budgets/abc/reserves";
      renderTabs({ locale: "en", budgetId: "abc", reservesEnabled: false });
      // Should not throw — reserves tab hidden
      const links = screen.getAllByRole("link");
      expect(links.length).toBe(3);
      // None of the visible links should have aria-current=page pointing at /reserves
      const activePills = links.filter(
        (l) => l.getAttribute("aria-current") === "page",
      );
      expect(activePills.length).toBe(0);
    });
  });

  it("inactive pills' label span carries 'hidden sm:inline' classes (mobile-collapse)", () => {
    mockPathname = "/en/budgets/abc/spendings";
    renderTabs({ locale: "en", budgetId: "abc" });
    const reserves = screen.getByRole("link", { name: "Reserves" });
    // Find the label <span> child (the visible-on-sm text node).
    const labelSpan = reserves.querySelector("span");
    expect(labelSpan).toBeTruthy();
    expect(labelSpan!.className).toMatch(/hidden/);
    expect(labelSpan!.className).toMatch(/sm:inline/);

    // Active tab's label span is always inline (no `hidden`). Re-render with spendings active.
    const spendings = screen.getByRole("link", { name: "Spendings" });
    const activeSpan = spendings.querySelector("span");
    expect(activeSpan).toBeTruthy();
    expect(activeSpan!.className).not.toMatch(/\bhidden\b/);
  });
});

describe("BdpTabs — per-pill badges", () => {
  beforeAll(() => {
    mockPathname = "/en/budgets/abc/spendings";
  });

  function renderWithTasks(tasks: TaskSummary[]) {
    return render(
      <TestQueryProvider>
        <BdpTabs locale="en" budgetId="abc" initialTasks={tasks} />
      </TestQueryProvider>,
    );
  }

  it("1 RESERVE_TOPUP → Reserves pill badge '1'; no badge on Wallets/Spendings/Settings", () => {
    const tasks: TaskSummary[] = [
      {
        id: "t1",
        budget_id: "abc",
        kind: "RESERVE_TOPUP",
        status: "PENDING",
        payload: {},
        created_at: "2026-06-01T00:00:00Z",
      },
    ];
    renderWithTasks(tasks);

    // Reserves link contains a badge with text "1"
    const reservesLink = screen.getByRole("link", { name: "Reserves" });
    const reservesBadge = reservesLink.querySelector(
      '[data-testid="pill-badge"]',
    );
    expect(reservesBadge).not.toBeNull();
    expect(reservesBadge!.textContent).toBe("1");

    // Other pills have no badge
    const walletsLink = screen.getByRole("link", { name: "Wallets" });
    expect(walletsLink.querySelector('[data-testid="pill-badge"]')).toBeNull();

    const spendingsLink = screen.getByRole("link", { name: "Spendings" });
    expect(
      spendingsLink.querySelector('[data-testid="pill-badge"]'),
    ).toBeNull();

    const settingsLink = screen.getByRole("link", { name: "Settings" });
    expect(settingsLink.querySelector('[data-testid="pill-badge"]')).toBeNull();
  });

  it("3 tasks (1 RESERVE_TOPUP, 1 CUSHION_BELOW_TARGET, 1 CONFIRM_DRAFT) → Reserves/Wallets/Spendings each '1'; Settings none", () => {
    const tasks: TaskSummary[] = [
      {
        id: "t1",
        budget_id: "abc",
        kind: "RESERVE_TOPUP",
        status: "PENDING",
        payload: {},
        created_at: "2026-06-01T00:00:00Z",
      },
      {
        id: "t2",
        budget_id: "abc",
        kind: "CUSHION_BELOW_TARGET",
        status: "PENDING",
        payload: {},
        created_at: "2026-06-01T00:00:00Z",
      },
      {
        id: "t3",
        budget_id: "abc",
        kind: "CONFIRM_DRAFT",
        status: "PENDING",
        payload: {},
        created_at: "2026-06-01T00:00:00Z",
      },
    ];
    renderWithTasks(tasks);

    const reservesLink = screen.getByRole("link", { name: "Reserves" });
    expect(
      reservesLink.querySelector('[data-testid="pill-badge"]')?.textContent,
    ).toBe("1");

    const walletsLink = screen.getByRole("link", { name: "Wallets" });
    expect(
      walletsLink.querySelector('[data-testid="pill-badge"]')?.textContent,
    ).toBe("1");

    const spendingsLink = screen.getByRole("link", { name: "Spendings" });
    expect(
      spendingsLink.querySelector('[data-testid="pill-badge"]')?.textContent,
    ).toBe("1");

    const settingsLink = screen.getByRole("link", { name: "Settings" });
    expect(settingsLink.querySelector('[data-testid="pill-badge"]')).toBeNull();
  });

  it("0 tasks → no pill-badge elements on the page", () => {
    renderWithTasks([]);
    expect(screen.queryAllByTestId("pill-badge")).toHaveLength(0);
  });
});
