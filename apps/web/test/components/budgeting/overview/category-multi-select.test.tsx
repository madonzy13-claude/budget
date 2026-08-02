/**
 * category-multi-select.test.tsx — the planned timeline's category picker (260802).
 *
 * A member unticks the categories that drown out the rest. Everything ticked, or
 * nothing ticked, both mean the whole chart — and the choice only reaches the
 * chart when the picker closes, so a burst of ticks is one refetch, not six.
 */
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${JSON.stringify(vars)}` : key,
}));

const { CategoryMultiSelect } =
  await import("@/components/budgeting/overview/category-multi-select");

const CATEGORIES = [
  { id: "a", name: "Food" },
  { id: "b", name: "Fun" },
  { id: "c", name: "Rent" },
];

const open = () =>
  fireEvent.click(screen.getByTestId("overview-planned-category"));

describe("Category multi-select", () => {
  it("reads as every category when nothing is picked", () => {
    render(
      <CategoryMultiSelect
        categories={CATEGORIES}
        selected={[]}
        onCommit={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId("overview-planned-category").textContent,
    ).toContain("planned.allCategories");
  });

  it("names the only category when exactly one is picked", () => {
    render(
      <CategoryMultiSelect
        categories={CATEGORIES}
        selected={["b"]}
        onCommit={vi.fn()}
      />,
    );
    expect(
      screen.getByTestId("overview-planned-category").textContent,
    ).toContain("Fun");
  });

  it("commits the ticks only once the picker closes", () => {
    const onCommit = vi.fn();
    render(
      <CategoryMultiSelect
        categories={CATEGORIES}
        selected={[]}
        onCommit={onCommit}
      />,
    );
    open();
    fireEvent.click(screen.getByRole("option", { name: "Food" }));
    fireEvent.click(screen.getByRole("option", { name: "Rent" }));
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onCommit).toHaveBeenCalledWith(["a", "c"]);
  });

  it("ticks and clears every category at once", () => {
    const onCommit = vi.fn();
    render(
      <CategoryMultiSelect
        categories={CATEGORIES}
        selected={["a"]}
        onCommit={onCommit}
      />,
    );
    open();
    fireEvent.click(screen.getByTestId("category-select-all"));
    expect(
      screen.getByRole("option", { name: "Fun" }).getAttribute("aria-selected"),
    ).toBe("true");
    fireEvent.click(screen.getByTestId("category-clear-all"));
    expect(
      screen
        .getByRole("option", { name: "Food" })
        .getAttribute("aria-selected"),
    ).toBe("false");
  });
});
