/**
 * budget-switcher.test.tsx — Vitest + RTL coverage for NAV-01/02/04
 * + empty state + z-index. Mocks next-intl + next/navigation.
 *
 * The active budget comes from the URL (a budget page carries its UUID); a
 * budget is shared when it has more than one member (kind-removal).
 *
 * NOTE: Radix Popover + happy-dom: open via `userEvent.click(trigger)`. After
 * the Popover state flips to open, the PopoverContent is portalled into the
 * body, so we query with `screen.*` (not `within(container)`).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();

let mockPathname = "/en";
vi.mock("next/navigation", () => ({
  usePathname: () => mockPathname,
}));
vi.mock("@/components/common/nav-pending", () => ({
  useNavRouter: () => ({ push: pushMock, refresh: vi.fn(), prefetch: vi.fn() }),
}));
// The live ["active-budgets"] overlay — undefined, so the `budgets` prop rules.
vi.mock("@/hooks/use-active-budgets", () => ({
  useActiveBudgets: () => ({ data: undefined }),
}));

// next-intl mock — flat key → EN copy. Keys mirror nav.* leaves in en.json.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      "nav.budgetSwitcher.trigger.aria": "Switch budget",
      "nav.switcher.personal": "Personal",
      "nav.switcher.shared": "Shared",
      "nav.switcher.allBudgets": "All budgets",
      "nav.switcher.empty.cta": "Create budget",
    };
    return map[key] ?? key;
  },
}));

import {
  BudgetSwitcher,
  type BudgetSummary,
} from "../../../src/components/budgeting/budget-switcher";

const MINE = "11111111-1111-4111-8111-111111111111";
const FAMILY = "22222222-2222-4222-8222-222222222222";

const mockBudgets: BudgetSummary[] = [
  {
    id: MINE,
    name: "My Budget",
    memberCount: 1,
    default_currency: "USD",
    pendingTasksCount: 0,
  },
  {
    id: FAMILY,
    name: "Family",
    memberCount: 2,
    default_currency: "PLN",
    pendingTasksCount: 0,
  },
];

const row = (name: RegExp) => screen.getByRole("menuitemradio", { name });

async function open(budgets = mockBudgets) {
  const user = userEvent.setup();
  const r = render(
    <BudgetSwitcher budgets={budgets} activeBudgetId={null} locale="en" />,
  );
  await user.click(screen.getByLabelText("Switch budget"));
  return { user, ...r };
}

describe("BudgetSwitcher", () => {
  beforeEach(() => {
    pushMock.mockReset();
    mockPathname = `/en/budgets/${MINE}/overview`;
  });

  it("groups private budgets under Personal and shared ones under Shared", async () => {
    await open();
    expect(screen.getByText("Personal")).toBeTruthy();
    expect(screen.getByText("Shared")).toBeTruthy();
    expect(row(/My Budget/)).toBeTruthy();
    expect(row(/Family/)).toBeTruthy();
  });

  it("marks the budget in the URL as the checked row, and only that one", async () => {
    await open();
    expect(row(/My Budget/).getAttribute("aria-checked")).toBe("true");
    expect(row(/Family/).getAttribute("aria-checked")).toBe("false");
    expect(row(/All budgets/).getAttribute("aria-checked")).toBe("false");
  });

  it("trigger shows the name of the budget in the URL", () => {
    render(
      <BudgetSwitcher
        budgets={mockBudgets}
        activeBudgetId={null}
        locale="en"
      />,
    );
    expect(screen.getByLabelText("Switch budget").textContent).toContain(
      "My Budget",
    );
  });

  it("picking another budget lands on the same pill in that budget (UAT-PH5-T2-02)", async () => {
    const { user } = await open();
    await user.click(row(/Family/));
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith(`/en/budgets/${FAMILY}/overview`);
  });

  it("does NOT navigate when the active row is clicked", async () => {
    const { user } = await open();
    await user.click(row(/My Budget/));
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("All budgets opens the aggregate page, and is checked when no budget is in the URL", async () => {
    mockPathname = "/en";
    const { user } = await open();
    expect(row(/All budgets/).getAttribute("aria-checked")).toBe("true");
    expect(row(/My Budget/).getAttribute("aria-checked")).toBe("false");
    await user.click(row(/All budgets/));
    expect(pushMock).toHaveBeenCalledWith("/en/?list=1");
  });

  it("trigger renders chevron-only (no budget name) when no budget is in the URL (UAT-PH5-T3-13)", () => {
    mockPathname = "/en";
    render(
      <BudgetSwitcher
        budgets={mockBudgets}
        activeBudgetId={null}
        locale="en"
      />,
    );
    const trigger = screen.getByLabelText("Switch budget");
    expect(trigger.textContent).not.toContain("My Budget");
    expect(trigger.textContent).not.toContain("Family");
    expect(trigger.querySelector(".lucide-chevron-down")).toBeTruthy();
  });

  // UAT-PH5-T2-03: when there are no budgets, the switcher is hidden entirely
  // from the header. The home page renders its own "Create your first budget"
  // empty state, so the header chrome can stay clean.
  it("empty state: BudgetSwitcher renders nothing (no trigger, no popover) — UAT-PH5-T2-03", () => {
    const { container } = render(
      <BudgetSwitcher budgets={[]} activeBudgetId={null} locale="en" />,
    );
    expect(container.querySelector("button")).toBeNull();
    expect(screen.queryByLabelText("Switch budget")).toBeNull();
  });

  // UAT-PH5-T2-03: populated dropdown includes a trailing "Create budget" CTA
  // in place of the removed header "+" button.
  it("populated dropdown shows 'Create budget'; clicking it routes to /budgets/new", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("menuitem", { name: /create budget/i }));
    expect(pushMock).toHaveBeenCalledWith("/en/budgets/new");
  });

  // UAT-PH5-T3-05: with one kind of budget the section heading is noise.
  it("only private budgets → no 'Personal' AND no 'Shared' heading (UAT-PH5-T3-05)", async () => {
    await open([mockBudgets[0]!]);
    expect(screen.queryByText("Personal")).toBeNull();
    expect(screen.queryByText("Shared")).toBeNull();
    expect(row(/My Budget/)).toBeTruthy();
  });

  it("only shared budgets → no 'Personal' AND no 'Shared' heading (UAT-PH5-T3-05)", async () => {
    await open([mockBudgets[1]!]);
    expect(screen.queryByText("Personal")).toBeNull();
    expect(screen.queryByText("Shared")).toBeNull();
    expect(row(/Family/)).toBeTruthy();
  });

  // UAT-PH5-T3-06: no Lock glyph; one person for private, a couple for shared.
  it("private rows carry a single-person glyph, shared rows a couple, never a lock (UAT-PH5-T3-06)", async () => {
    const { container } = await open();
    expect(container.querySelector(".lucide-lock")).toBeNull();
    expect(document.querySelectorAll(".lucide-lock").length).toBe(0);
    expect(row(/My Budget/).querySelector(".lucide-user")).toBeTruthy();
    expect(row(/Family/).querySelector(".lucide-users")).toBeTruthy();
  });

  it("PopoverContent carries `z-[60]` class (above sticky top-nav z-50 and BDP sticky wrapper z-40)", async () => {
    await open();
    let el: HTMLElement | null = row(/Family/);
    while (el && !el.className.includes("z-[60]")) el = el.parentElement;
    expect(el?.className).toContain("z-[60]");
  });

  it("a budget's pending tasks show as a count on its row", async () => {
    await open([mockBudgets[0]!, { ...mockBudgets[1]!, pendingTasksCount: 3 }]);
    expect(row(/Family/).textContent).toContain("3");
    expect(row(/My Budget/).textContent).not.toMatch(/\d/);
  });
});
