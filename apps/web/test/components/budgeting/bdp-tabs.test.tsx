/**
 * bdp-tabs.test.tsx — Vitest + RTL coverage for the BdpTabs client component.
 *
 * Mocks next/navigation usePathname and next-intl useTranslations so the test
 * focuses on routing-driven active state, aria semantics, mobile-collapse class
 * presence, and route-as-tab anchors (BDP-05 / D-PH3-04).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

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

import { BdpTabs } from "@/components/budgeting/bdp-tabs";

describe("BdpTabs", () => {
  // UAT-PH5-T2-02: pill order reordered — Wallets first per user feedback.
  it("renders 4 Link elements in order: Wallets, Spendings, Reserves, Settings", () => {
    mockPathname = "/en/budgets/abc/wallets";
    render(<BdpTabs locale="en" budgetId="abc" />);
    const links = screen.getAllByRole("link");
    expect(links.length).toBe(4);
    const labels = links.map((l) => l.getAttribute("aria-label"));
    expect(labels).toEqual(["Wallets", "Spendings", "Reserves", "Settings"]);
  });

  it('active pill has aria-current="page" when pathname matches its href', () => {
    mockPathname = "/en/budgets/abc/reserves";
    render(<BdpTabs locale="en" budgetId="abc" />);
    const reserves = screen.getByRole("link", { name: "Reserves" });
    expect(reserves.getAttribute("aria-current")).toBe("page");
  });

  it("default pathname /en/budgets/abc/spendings → Spendings has aria-current; others do not", () => {
    mockPathname = "/en/budgets/abc/spendings";
    render(<BdpTabs locale="en" budgetId="abc" />);
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
    render(<BdpTabs locale="en" budgetId="abc" />);
    const wallets = screen.getByRole("link", { name: "Wallets" });
    expect(wallets.getAttribute("aria-current")).toBe("page");
    expect(wallets.className).toMatch(/bg-\[var\(--primary\)\]/);
    expect(wallets.className).toMatch(/text-\[var\(--on-primary\)\]/);
  });

  it("each pill is an <a> anchor element (route-as-tab — BDP-05 / D-PH3-04), not <button>", () => {
    mockPathname = "/en/budgets/abc/spendings";
    render(<BdpTabs locale="en" budgetId="abc" />);
    const links = screen.getAllByRole("link");
    links.forEach((l) => expect(l.tagName).toBe("A"));
    // No <button> tabs.
    expect(screen.queryAllByRole("button").length).toBe(0);
  });

  it("each pill carries aria-label resolved from t(`${slug}.label`)", () => {
    mockPathname = "/en/budgets/abc/spendings";
    render(<BdpTabs locale="en" budgetId="abc" />);
    expect(screen.getByRole("link", { name: "Spendings" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Reserves" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Wallets" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Settings" })).toBeTruthy();
  });

  // D-PH5-R11: cascading-hide surface 1 — reservesEnabled prop
  describe("reservesEnabled cascading-hide (D-PH5-R11 surface 1)", () => {
    it("no prop (undefined) → defaults to true → renders all 4 pills including Reserves", () => {
      mockPathname = "/en/budgets/abc/spendings";
      render(<BdpTabs locale="en" budgetId="abc" />);
      const links = screen.getAllByRole("link");
      expect(links.length).toBe(4);
      expect(screen.getByRole("link", { name: "Reserves" })).toBeTruthy();
    });

    it("reservesEnabled={true} → renders all 4 pills including Reserves", () => {
      mockPathname = "/en/budgets/abc/spendings";
      render(<BdpTabs locale="en" budgetId="abc" reservesEnabled={true} />);
      const links = screen.getAllByRole("link");
      expect(links.length).toBe(4);
      expect(screen.getByRole("link", { name: "Reserves" })).toBeTruthy();
    });

    it("reservesEnabled={false} → renders 3 pills in order Wallets, Spendings, Settings", () => {
      mockPathname = "/en/budgets/abc/spendings";
      render(<BdpTabs locale="en" budgetId="abc" reservesEnabled={false} />);
      const links = screen.getAllByRole("link");
      expect(links.length).toBe(3);
      const labels = links.map((l) => l.getAttribute("aria-label"));
      expect(labels).toEqual(["Wallets", "Spendings", "Settings"]);
      expect(labels).not.toContain("Reserves");
      expect(screen.queryByRole("link", { name: "Reserves" })).toBeNull();
    });

    it("reservesEnabled={false} + activeSlug=reserves → does not crash; no pill is active-current", () => {
      mockPathname = "/en/budgets/abc/reserves";
      render(<BdpTabs locale="en" budgetId="abc" reservesEnabled={false} />);
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
    render(<BdpTabs locale="en" budgetId="abc" />);
    const reserves = screen.getByRole("link", { name: "Reserves" });
    // Find the label <span> child (the visible-on-sm text node).
    const labelSpan = reserves.querySelector("span");
    expect(labelSpan).toBeTruthy();
    expect(labelSpan!.className).toMatch(/hidden/);
    expect(labelSpan!.className).toMatch(/sm:inline/);

    // Active tab's label span is always inline (no `hidden`).
    const spendings = screen.getByRole("link", { name: "Spendings" });
    const activeSpan = spendings.querySelector("span");
    expect(activeSpan).toBeTruthy();
    expect(activeSpan!.className).not.toMatch(/\bhidden\b/);
  });
});
