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

  it("shows every box ticked while the chart is unfiltered", () => {
    // Stored as an empty set, shown as all-ticked: with them unticked, clicking
    // a row to DROP that category selected it instead (user report).
    render(
      <CategoryMultiSelect
        categories={CATEGORIES}
        selected={[]}
        onCommit={vi.fn()}
      />,
    );
    open();
    for (const name of ["Food", "Fun", "Rent"])
      expect(
        screen.getByRole("option", { name }).getAttribute("aria-selected"),
      ).toBe("true");
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
    // Untick the one to hide — the other two stay.
    fireEvent.click(screen.getByRole("option", { name: "Fun" }));
    expect(onCommit).not.toHaveBeenCalled();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onCommit).toHaveBeenCalledWith(["a", "c"]);
  });

  it("goes back to unfiltered when every box is ticked again", () => {
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
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(onCommit).toHaveBeenCalledWith([]);
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

/**
 * Brand yellow as TEXT is unreadable on the pale card (user, 260810), so
 * "Select all" takes the ink that flips with the theme — the same token the
 * meter's verdict uses. Yellow as a SHAPE is untouched.
 */
describe("CategoryMultiSelect — readable on either theme", () => {
  it("draws Select all in the theme-flipping ink, not the raw brand yellow", async () => {
    render(
      <CategoryMultiSelect
        categories={CATEGORIES}
        selected={[]}
        onCommit={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByTestId("overview-planned-category"));
    const link = await screen.findByTestId("category-select-all");
    expect(link.className).toContain("var(--accent-ink)");
    expect(link.className).not.toContain("text-[var(--primary)]");
  });
});
