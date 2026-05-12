/**
 * new-budget-button.test.tsx — Vitest + RTL coverage for NAV-03.
 * Mocks next-intl + next/navigation.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const pushMock = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const map: Record<string, string> = {
      "nav.newBudget": "New budget",
      "nav.newBudgetTooltip": "Create new budget",
    };
    return map[key] ?? key;
  },
}));

import { NewBudgetButton } from "../../../src/components/budgeting/new-budget-button";

describe("NewBudgetButton", () => {
  beforeEach(() => {
    pushMock.mockReset();
  });

  it("renders a button with aria-label 'New budget'", () => {
    render(<NewBudgetButton locale="en" />);
    const btn = screen.getByLabelText("New budget");
    expect(btn).toBeTruthy();
    expect(btn.tagName).toBe("BUTTON");
  });

  it("renders a lucide Plus icon", () => {
    const { container } = render(<NewBudgetButton locale="en" />);
    // lucide-react attaches class `lucide-plus` on the SVG
    const svg = container.querySelector("svg.lucide-plus");
    expect(svg).toBeTruthy();
  });

  it("click calls router.push('/en/budgets/new') exactly", async () => {
    const user = userEvent.setup();
    render(<NewBudgetButton locale="en" />);
    await user.click(screen.getByLabelText("New budget"));
    expect(pushMock).toHaveBeenCalledTimes(1);
    expect(pushMock).toHaveBeenCalledWith("/en/budgets/new");
  });

  it("Button uses variant=ghost size=icon (40x40 size-10 class on the rendered element)", () => {
    render(<NewBudgetButton locale="en" />);
    const btn = screen.getByLabelText("New budget");
    // shadcn Button with size="icon" applies the `size-10` class via CVA
    expect(btn.className).toContain("size-10");
    // ghost variant uses transparent bg
    expect(btn.className).toContain("bg-transparent");
  });
});
