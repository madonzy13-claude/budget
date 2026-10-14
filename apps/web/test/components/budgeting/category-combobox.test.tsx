/**
 * category-combobox.test.tsx — pick an existing category or name a new one
 * without leaving the form (user, 261014).
 *
 * The scheduled-payment form only offered a plain Select over whatever
 * categories already existed, so a payment for something new meant abandoning
 * the form, creating the category elsewhere, and starting again. Worse, the
 * picker only rendered `when categories.length > 0` — on a budget with none,
 * there was no way through at all.
 *
 * Modelled on the investments GroupCombobox, which the household already uses:
 * type to filter, and when nothing matches the first row takes what was typed.
 *
 * It creates NOTHING. Naming a category here only records the intent; the form
 * creates it on submit, immediately before the rule that will carry it (user,
 * 261014), so abandoning the form leaves no stray category behind. That keeps
 * this component a pure control with no network of its own.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vals?: Record<string, unknown>) =>
    vals ? `${key}(${JSON.stringify(vals)})` : key,
  useLocale: () => "en",
}));

import { CategoryCombobox } from "@/components/budgeting/category-combobox";

const CATEGORIES = [
  { id: "c1", name: "Food & Home" },
  { id: "c2", name: "Car" },
];

function renderBox(
  props: Partial<React.ComponentProps<typeof CategoryCombobox>> = {},
) {
  const onChange = vi.fn();
  render(
    <CategoryCombobox
      categories={CATEGORIES}
      value={null}
      onChange={onChange}
      {...props}
    />,
  );
  return { onChange };
}

async function openAndType(text: string) {
  fireEvent.click(screen.getByTestId("category-combobox-trigger"));
  const input = await screen.findByTestId("category-combobox-input");
  fireEvent.change(input, { target: { value: text } });
  return input;
}

describe("CategoryCombobox", () => {
  it("filters the categories that already exist", async () => {
    renderBox();
    await openAndType("Ca");
    expect(screen.getByText("Car")).toBeTruthy();
    expect(screen.queryByText("Food & Home")).toBeNull();
  });

  it("reports an existing pick by id", async () => {
    const { onChange } = renderBox();
    await openAndType("Ca");
    fireEvent.click(screen.getByText("Car"));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ kind: "existing", id: "c2" }),
    );
  });

  it("offers to take what was typed when nothing matches", async () => {
    renderBox();
    await openAndType("Fuel");
    expect(screen.getByTestId("category-combobox-create")).toBeTruthy();
  });

  it("reports a new name as intent, not as an id", async () => {
    const { onChange } = renderBox();
    await openAndType("Fuel");
    fireEvent.click(screen.getByTestId("category-combobox-create"));
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith({ kind: "new", name: "Fuel" }),
    );
  });

  it("does not offer to create a name that already exists", async () => {
    renderBox();
    await openAndType("Car");
    expect(screen.queryByTestId("category-combobox-create")).toBeNull();
  });

  it("ignores case when deciding a name already exists", async () => {
    renderBox();
    await openAndType("  car ");
    expect(screen.queryByTestId("category-combobox-create")).toBeNull();
  });

  // The old Select rendered only `when categories.length > 0`, so a budget
  // with none offered no way to attach a payment to anything.
  it("still offers to create on a budget with no categories at all", async () => {
    renderBox({ categories: [] });
    await openAndType("Fuel");
    expect(screen.getByTestId("category-combobox-create")).toBeTruthy();
  });

  it("shows a chosen new name on the trigger before it exists", () => {
    renderBox({ value: { kind: "new", name: "Fuel" } });
    expect(screen.getByTestId("category-combobox-trigger").textContent).toContain(
      "Fuel",
    );
  });
});

/**
 * The dropdown has to live INSIDE the sheet that opened it (user, 261014:
 * "I cannot scroll inside the drop-down, I'm only able to select from items
 * visible in viewport").
 *
 * The scheduled-payment form is a Radix Sheet, and a Dialog locks scrolling
 * through react-remove-scroll: touchmove is blocked everywhere except inside
 * the dialog's own content. `Popover.Portal` defaults to document.body, which
 * is outside it — so the list rendered, tapping a visible row worked, and the
 * list could not be scrolled by touch at all. Portalling into the dialog puts
 * it back inside the allowed region.
 */
describe("CategoryCombobox inside a dialog", () => {
  it("renders its list inside the dialog, not on document.body", async () => {
    const onChange = vi.fn();
    render(
      <div role="dialog" data-state="open" data-testid="the-sheet">
        <CategoryCombobox
          categories={CATEGORIES}
          value={null}
          onChange={onChange}
        />
      </div>,
    );
    fireEvent.click(screen.getByTestId("category-combobox-trigger"));
    const input = await screen.findByTestId("category-combobox-input");
    expect(screen.getByTestId("the-sheet").contains(input)).toBe(true);
  });

  it("still portals to the body when there is no dialog around it", async () => {
    const onChange = vi.fn();
    render(
      <CategoryCombobox
        categories={CATEGORIES}
        value={null}
        onChange={onChange}
      />,
    );
    fireEvent.click(screen.getByTestId("category-combobox-trigger"));
    const input = await screen.findByTestId("category-combobox-input");
    // Radix gives its own popover content role="dialog", so the check is that
    // no SHEET wrapped it — the list still lands on the body.
    expect(screen.queryByTestId("the-sheet")).toBeNull();
    expect(document.body.contains(input)).toBe(true);
  });
});

/**
 * A category's colour is how it is recognised everywhere else in the app — the
 * accent lane on its spendings column, its slice in every chart. The picker
 * showed names only, so choosing one meant reading rather than recognising
 * (user, 261014).
 *
 * The dot renders only where a colour is set, matching the pickers that
 * already do this: a category with no colour keeps its name flush left rather
 * than being indented past an empty swatch.
 */
describe("CategoryCombobox — colours", () => {
  const COLOURED = [
    { id: "c1", name: "Food & Home", colorKey: "green" },
    { id: "c2", name: "Car", colorKey: null },
  ];

  it("shows the category's colour beside its name", async () => {
    renderBox({ categories: COLOURED });
    fireEvent.click(screen.getByTestId("category-combobox-trigger"));
    await screen.findByTestId("category-combobox-input");
    const dot = screen.getByTestId("category-dot-c1");
    // green → #26A69A (happy-dom keeps the hex literal)
    expect(dot.style.backgroundColor.toUpperCase()).toBe("#26A69A");
  });

  it("renders no swatch for a category without a colour", async () => {
    renderBox({ categories: COLOURED });
    fireEvent.click(screen.getByTestId("category-combobox-trigger"));
    await screen.findByTestId("category-combobox-input");
    expect(screen.queryByTestId("category-dot-c2")).toBeNull();
  });

  it("carries the colour onto the trigger once chosen", async () => {
    renderBox({
      categories: COLOURED,
      value: { kind: "existing", id: "c1" },
    });
    const dot = screen.getByTestId("category-dot-selected");
    expect(dot.style.backgroundColor.toUpperCase()).toBe("#26A69A");
  });
});

/**
 * The box said only "Category", so it read as a filter — nothing hinted that
 * typing an unused name would MAKE one, and the `+ Create "…"` row only
 * appears after you have already typed it. The invitation has to come before
 * the typing, not after (user, 261014).
 */
describe("CategoryCombobox — says you can create", () => {
  it("invites creating, not just searching, in the search box", async () => {
    renderBox();
    fireEvent.click(screen.getByTestId("category-combobox-trigger"));
    const input = await screen.findByTestId("category-combobox-input");
    expect(input.getAttribute("placeholder")).toBe(
      "rule.categorySearchOrCreate",
    );
  });

  it("says the same on the closed field before anything is chosen", () => {
    renderBox();
    expect(
      screen.getByTestId("category-combobox-trigger").textContent,
    ).toContain("rule.categorySearchOrCreate");
  });
});
