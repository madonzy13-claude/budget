/**
 * budget-switcher.test.tsx — Vitest + RTL coverage for NAV-01/02/04
 * + empty state + z-index. Mocks next-intl + next/navigation.
 *
 * NOTE: Radix Popover + happy-dom: open via `userEvent.click(trigger)`. After
 * the Popover state flips to open, the PopoverContent is portalled into the
 * body, so we query with `screen.*` (not `within(container)`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));

// next-intl mock — flat key → EN copy. Keys mirror nav.* leaves in en.json.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      "nav.budgetSwitcher.trigger.aria": "Switch budget",
      "nav.switcher.personal": "Personal",
      "nav.switcher.shared": "Shared",
      "nav.switcher.empty.trigger": "No budgets yet",
      "nav.switcher.empty.body": "Use + to create your first budget.",
      "nav.switcher.empty.cta": "Create budget",
    };
    return map[key] ?? key;
  },
}));

import {
  BudgetSwitcher,
  type BudgetSummary,
} from "../../../src/components/budgeting/budget-switcher";

const mockBudgets: BudgetSummary[] = [
  { id: "b1", name: "My Budget", kind: "PRIVATE", default_currency: "USD" },
  { id: "b2", name: "Family", kind: "SHARED", default_currency: "PLN" },
];

describe("BudgetSwitcher", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it("renders PRIVATE budgets under the Personal section heading", async () => {
    const user = userEvent.setup();
    render(
      <BudgetSwitcher budgets={mockBudgets} activeBudgetId="b1" locale="en" />,
    );
    await user.click(screen.getByLabelText("Switch budget"));
    expect(screen.getByText("Personal")).toBeTruthy();
    // "My Budget" appears in both the trigger label AND the menuitemradio row.
    // Asserting at least one occurrence is sufficient to confirm the Personal-group row rendered.
    const myBudgetEls = screen.getAllByText("My Budget");
    expect(myBudgetEls.length).toBeGreaterThanOrEqual(1);
    // Also: the active row exists under Personal heading
    const rows = screen.getAllByRole("menuitemradio");
    const privateRow = rows.find((r) => r.textContent?.includes("My Budget"));
    expect(privateRow).toBeTruthy();
  });

  it("renders SHARED budgets under the Shared section heading", async () => {
    const user = userEvent.setup();
    render(
      <BudgetSwitcher budgets={mockBudgets} activeBudgetId="b1" locale="en" />,
    );
    await user.click(screen.getByLabelText("Switch budget"));
    expect(screen.getByText("Shared")).toBeTruthy();
    expect(screen.getByText("Family")).toBeTruthy();
  });

  it("renders a Check icon on the active row and not on non-active rows", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <BudgetSwitcher budgets={mockBudgets} activeBudgetId="b1" locale="en" />,
    );
    await user.click(screen.getByLabelText("Switch budget"));
    const rows = screen.getAllByRole("menuitemradio");
    // active row (b1) — has lucide-check svg
    const activeRow = rows.find(
      (r) => r.getAttribute("aria-checked") === "true",
    );
    expect(activeRow).toBeTruthy();
    expect(activeRow!.querySelector(".lucide-check")).toBeTruthy();
    // non-active row (b2) — no lucide-check svg
    const inactiveRow = rows.find(
      (r) => r.getAttribute("aria-checked") === "false",
    );
    expect(inactiveRow).toBeTruthy();
    expect(inactiveRow!.querySelector(".lucide-check")).toBeFalsy();
    expect(container).toBeTruthy();
  });

  it("renders currency Badge with budget.default_currency on every row", async () => {
    const user = userEvent.setup();
    render(
      <BudgetSwitcher budgets={mockBudgets} activeBudgetId="b1" locale="en" />,
    );
    await user.click(screen.getByLabelText("Switch budget"));
    expect(screen.getByText("USD")).toBeTruthy();
    expect(screen.getByText("PLN")).toBeTruthy();
  });

  it("router.push('/en/budgets/${id}/spendings') when a non-active row is clicked", async () => {
    const user = userEvent.setup();
    render(
      <BudgetSwitcher budgets={mockBudgets} activeBudgetId="b1" locale="en" />,
    );
    await user.click(screen.getByLabelText("Switch budget"));
    const rows = screen.getAllByRole("menuitemradio");
    const nonActive = rows.find(
      (r) => r.getAttribute("aria-checked") === "false",
    )!;
    await user.click(nonActive);
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/en/budgets/b2/spendings");
  });

  it("does NOT call router.push when the active row is clicked", async () => {
    const user = userEvent.setup();
    render(
      <BudgetSwitcher budgets={mockBudgets} activeBudgetId="b1" locale="en" />,
    );
    await user.click(screen.getByLabelText("Switch budget"));
    const rows = screen.getAllByRole("menuitemradio");
    const active = rows.find((r) => r.getAttribute("aria-checked") === "true")!;
    await user.click(active);
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("empty state: no menuitemradio rows, trigger shows i18n empty label, CTA routes to /budgets/new", async () => {
    const user = userEvent.setup();
    render(<BudgetSwitcher budgets={[]} activeBudgetId={null} locale="en" />);
    // Trigger label is the empty-state copy.
    expect(screen.getByText("No budgets yet")).toBeTruthy();
    await user.click(screen.getByLabelText("Switch budget"));
    // No menuitemradio rows.
    expect(screen.queryAllByRole("menuitemradio").length).toBe(0);
    // CTA present + routes correctly.
    const cta = screen.getByText("Create budget");
    expect(cta).toBeTruthy();
    await user.click(cta);
    expect(pushMock).toHaveBeenCalledWith("/en/budgets/new");
  });

  it("hides the Shared section heading entirely if no SHARED budgets exist", async () => {
    const user = userEvent.setup();
    const onlyPrivate: BudgetSummary[] = [
      { id: "p1", name: "Solo", kind: "PRIVATE", default_currency: "USD" },
    ];
    render(
      <BudgetSwitcher budgets={onlyPrivate} activeBudgetId="p1" locale="en" />,
    );
    await user.click(screen.getByLabelText("Switch budget"));
    expect(screen.getByText("Personal")).toBeTruthy();
    expect(screen.queryByText("Shared")).toBeNull();
  });

  it("PopoverContent carries `z-[60]` class (above sticky top-nav z-50 and BDP sticky wrapper z-40)", async () => {
    const user = userEvent.setup();
    render(
      <BudgetSwitcher budgets={mockBudgets} activeBudgetId="b1" locale="en" />,
    );
    await user.click(screen.getByLabelText("Switch budget"));
    // Radix portals the content to body. Locate via a stable child (Personal heading)
    // and walk up to the data-radix popover content element.
    const heading = screen.getByText("Personal");
    let el: HTMLElement | null = heading;
    while (el && !el.className.includes("z-[60]")) {
      el = el.parentElement;
    }
    expect(el).toBeTruthy();
    expect(el!.className).toContain("z-[60]");
  });
});
