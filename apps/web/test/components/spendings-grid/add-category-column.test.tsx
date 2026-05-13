/**
 * add-category-column.test.tsx — Vitest+RTL tests for AddCategoryColumn.
 * D-PH4-S4: dashed + column triggers CategorySlider create mode.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AddCategoryColumn } from "../../../src/components/budgeting/spendings-grid/add-category-column";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

describe("AddCategoryColumn", () => {
  it("has data-testid=add-category-column", () => {
    render(<AddCategoryColumn onClick={vi.fn()} />);
    expect(screen.getByTestId("add-category-column")).toBeTruthy();
  });

  it("single click calls onClick prop", () => {
    const onClick = vi.fn();
    render(<AddCategoryColumn onClick={onClick} />);
    fireEvent.click(screen.getByTestId("add-category-column"));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("is focusable (tabIndex)", () => {
    render(<AddCategoryColumn onClick={vi.fn()} />);
    const el = screen.getByTestId("add-category-column");
    const tabIndex = Number(el.getAttribute("tabindex") ?? el.tabIndex);
    expect(tabIndex).toBeGreaterThanOrEqual(0);
  });

  it("Enter key triggers onClick", () => {
    const onClick = vi.fn();
    render(<AddCategoryColumn onClick={onClick} />);
    const el = screen.getByTestId("add-category-column");
    fireEvent.keyDown(el, { key: "Enter" });
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it("renders Plus icon or + text", () => {
    render(<AddCategoryColumn onClick={vi.fn()} />);
    const el = screen.getByTestId("add-category-column");
    // either SVG (Plus lucide) or text content contains +
    const hasPlusIcon = el.querySelector("svg") !== null;
    const hasPlusText = el.textContent?.includes("+") ?? false;
    expect(hasPlusIcon || hasPlusText).toBe(true);
  });
});
