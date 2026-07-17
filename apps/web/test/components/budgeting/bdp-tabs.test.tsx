/**
 * bdp-tabs.test.tsx — Vitest + RTL coverage for the BdpTabs client component.
 *
 * BdpTabs is now prop-driven: pills are BUTTONS (client tab switch via
 * pushState, not route links). Active state comes from the `activeTab` prop and
 * clicking a pill calls `onSelect(slug)`. These tests cover order, aria
 * semantics, the active indicator, mobile-collapse, reservesEnabled cascading
 * hide, the onSelect callback, and per-pill badges.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TestQueryProvider } from "../../setup/query-client";

vi.mock("next-intl", () => ({
  useTranslations: (_ns: string) => (key: string) => {
    const map: Record<string, string> = {
      aria: "Budget detail tabs",
      "overview.label": "Overview",
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
import type { BdpTab } from "@/lib/bdp-tabs";

function renderTabs(
  props: Partial<Parameters<typeof BdpTabs>[0]> & { activeTab?: BdpTab } = {},
) {
  const onSelect = props.onSelect ?? vi.fn();
  const utils = render(
    <TestQueryProvider>
      <BdpTabs
        locale="en"
        budgetId="abc"
        activeTab={props.activeTab ?? "wallets"}
        onSelect={onSelect}
        reservesEnabled={props.reservesEnabled}
        initialTasks={props.initialTasks}
      />
    </TestQueryProvider>,
  );
  return { ...utils, onSelect };
}

describe("BdpTabs", () => {
  it("renders 5 pill buttons in order: Overview, Wallets, Spendings, Reserves, Settings", () => {
    renderTabs({ activeTab: "overview" });
    const pills = screen.getAllByRole("button");
    expect(pills.length).toBe(5);
    const labels = pills.map((p) => p.getAttribute("aria-label"));
    expect(labels).toEqual([
      "Overview",
      "Wallets",
      "Spendings",
      "Reserves",
      "Settings",
    ]);
  });

  it("Tab cycles to the next pill; Shift+Tab to the previous; wrapping (item 9)", () => {
    const onSelect = vi.fn();
    renderTabs({ activeTab: "wallets", onSelect });
    fireEvent.keyDown(window, { key: "Tab" });
    expect(onSelect).toHaveBeenLastCalledWith("spendings"); // wallets → spendings
    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(onSelect).toHaveBeenLastCalledWith("overview"); // wallets → overview
  });

  it("Tab wraps from the last pill back to the first", () => {
    const onSelect = vi.fn();
    renderTabs({ activeTab: "settings", onSelect });
    fireEvent.keyDown(window, { key: "Tab" });
    expect(onSelect).toHaveBeenLastCalledWith("overview");
  });

  it("Tab does NOT cycle pills while a real form field is focused", () => {
    const onSelect = vi.fn();
    renderTabs({ activeTab: "wallets", onSelect });
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.focus();
    fireEvent.keyDown(window, { key: "Tab" });
    expect(onSelect).not.toHaveBeenCalled();
    input.remove();
  });

  it("each pill is a <button>, not an anchor", () => {
    renderTabs({ activeTab: "spendings" });
    const pills = screen.getAllByRole("button");
    pills.forEach((p) => expect(p.tagName).toBe("BUTTON"));
    expect(screen.queryAllByRole("link").length).toBe(0);
  });

  it('active pill (from activeTab prop) has aria-current="page"', () => {
    renderTabs({ activeTab: "reserves" });
    const reserves = screen.getByRole("button", { name: "Reserves" });
    expect(reserves.getAttribute("aria-current")).toBe("page");
  });

  it("activeTab=spendings → Spendings has aria-current; others do not", () => {
    renderTabs({ activeTab: "spendings" });
    expect(
      screen
        .getByRole("button", { name: "Spendings" })
        .getAttribute("aria-current"),
    ).toBe("page");
    for (const name of ["Reserves", "Wallets", "Settings"]) {
      expect(
        screen.getByRole("button", { name }).getAttribute("aria-current"),
      ).toBeNull();
    }
  });

  it("active pill: on-primary text + a yellow indicator child (framer layoutId); inactive has none", () => {
    renderTabs({ activeTab: "wallets" });
    const wallets = screen.getByRole("button", { name: "Wallets" });
    expect(wallets.getAttribute("aria-current")).toBe("page");
    expect(wallets.className).toMatch(/text-\[var\(--on-primary\)\]/);
    expect(
      wallets.querySelector(".bg-\\[var\\(--primary\\)\\]"),
    ).not.toBeNull();
    const settings = screen.getByRole("button", { name: "Settings" });
    expect(settings.querySelector(".bg-\\[var\\(--primary\\)\\]")).toBeNull();
  });

  it("clicking a pill calls onSelect with that slug", () => {
    const { onSelect } = renderTabs({ activeTab: "wallets" });
    fireEvent.click(screen.getByRole("button", { name: "Reserves" }));
    expect(onSelect).toHaveBeenCalledWith("reserves");
  });

  it("each pill carries aria-label resolved from t(`${slug}.label`)", () => {
    renderTabs({ activeTab: "spendings" });
    for (const name of ["Spendings", "Reserves", "Wallets", "Settings"]) {
      expect(screen.getByRole("button", { name })).toBeTruthy();
    }
  });

  describe("reservesEnabled cascading-hide (D-PH5-R11 surface 1)", () => {
    it("no prop (undefined) → defaults to true → 5 pills incl. Reserves", () => {
      renderTabs({ activeTab: "spendings" });
      expect(screen.getAllByRole("button").length).toBe(5);
      expect(screen.getByRole("button", { name: "Reserves" })).toBeTruthy();
    });

    it("reservesEnabled={true} → 5 pills incl. Reserves", () => {
      renderTabs({ activeTab: "spendings", reservesEnabled: true });
      expect(screen.getAllByRole("button").length).toBe(5);
      expect(screen.getByRole("button", { name: "Reserves" })).toBeTruthy();
    });

    it("reservesEnabled={false} → 4 pills: Overview, Wallets, Spendings, Settings", () => {
      renderTabs({ activeTab: "spendings", reservesEnabled: false });
      const pills = screen.getAllByRole("button");
      expect(pills.length).toBe(4);
      expect(pills.map((p) => p.getAttribute("aria-label"))).toEqual([
        "Overview",
        "Wallets",
        "Spendings",
        "Settings",
      ]);
      expect(screen.queryByRole("button", { name: "Reserves" })).toBeNull();
    });
  });

  it("inactive pill label collapses on mobile (hidden sm:inline); active label always shows", () => {
    renderTabs({ activeTab: "spendings" });
    const reservesLabel = screen
      .getByRole("button", { name: "Reserves" })
      .querySelector("span");
    expect(reservesLabel!.className).toMatch(/hidden/);
    expect(reservesLabel!.className).toMatch(/sm:inline/);

    const activeLabel = screen
      .getByRole("button", { name: "Spendings" })
      .querySelector("span");
    expect(activeLabel!.className).not.toMatch(/\bhidden\b/);
  });
});

describe("BdpTabs — per-pill badges", () => {
  function renderWithTasks(tasks: TaskSummary[]) {
    return render(
      <TestQueryProvider>
        <BdpTabs
          locale="en"
          budgetId="abc"
          activeTab="spendings"
          onSelect={vi.fn()}
          initialTasks={tasks}
        />
      </TestQueryProvider>,
    );
  }

  function task(id: string, kind: TaskSummary["kind"]): TaskSummary {
    return {
      id,
      budget_id: "abc",
      kind,
      status: "PENDING",
      payload: {},
      created_at: "2026-06-01T00:00:00Z",
    };
  }

  it("1 RESERVE_TOPUP → Reserves badge '1'; none on the others", () => {
    renderWithTasks([task("t1", "RESERVE_TOPUP")]);
    const reserves = screen.getByRole("button", { name: "Reserves" });
    expect(
      reserves.querySelector('[data-testid="pill-badge"]')?.textContent,
    ).toBe("1");
    for (const name of ["Wallets", "Spendings", "Settings"]) {
      expect(
        screen
          .getByRole("button", { name })
          .querySelector('[data-testid="pill-badge"]'),
      ).toBeNull();
    }
  });

  it("3 mixed tasks → Reserves/Wallets/Spendings each '1'; Settings none", () => {
    renderWithTasks([
      task("t1", "RESERVE_TOPUP"),
      task("t2", "CUSHION_BELOW_TARGET"),
      task("t3", "CONFIRM_DRAFT"),
    ]);
    for (const name of ["Reserves", "Wallets", "Spendings"]) {
      expect(
        screen
          .getByRole("button", { name })
          .querySelector('[data-testid="pill-badge"]')?.textContent,
      ).toBe("1");
    }
    expect(
      screen
        .getByRole("button", { name: "Settings" })
        .querySelector('[data-testid="pill-badge"]'),
    ).toBeNull();
  });

  it("0 tasks → no pill-badge elements", () => {
    renderWithTasks([]);
    expect(screen.queryAllByTestId("pill-badge")).toHaveLength(0);
  });
});
