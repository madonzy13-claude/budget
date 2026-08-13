/**
 * reserve-fit-one-offs.test.tsx — the one-off dialog (260804 redesign).
 *
 * One button under the chart opens a dialog listing every large spend, biggest
 * first, with its category and date; the ones already set aside sit in their own
 * section at the top. Each row is a switch and SAVES ON FLIP — no Save/Cancel to
 * forget (user, 260804). The category filter is a real Select, and the dialog
 * must not grab focus into it on open, which on iOS threw the wheel picker up
 * the moment the dialog appeared.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vars?: Record<string, unknown>) =>
    vars ? `${key}:${Object.values(vars).join(",")}` : key,
  useLocale: () => "en",
}));

const { ReserveFitOneOffs } =
  await import("@/components/budgeting/overview/reserve-fit-one-offs");

const CANDIDATES = [
  {
    ledger_id: "tx-blank",
    category_id: "sport",
    category_name: "Sport",
    transaction_date: "2026-01-05",
    note: null,
    amount_cents: "70000",
    scheduled_cadence: null,
    excluded: false,
  },
  {
    ledger_id: "tx-jump",
    category_id: "sport",
    category_name: "Sport",
    transaction_date: "2026-03-14",
    note: "Parachute jump",
    amount_cents: "480000",
    scheduled_cadence: null,
    excluded: false,
  },
  {
    ledger_id: "tx-ins",
    category_id: "car",
    category_name: "Car",
    transaction_date: "2025-09-01",
    note: "Insurance",
    amount_cents: "500000",
    scheduled_cadence: "YEARLY",
    excluded: false,
  },
  {
    ledger_id: "tx-tyres",
    category_id: "car",
    category_name: "Car",
    transaction_date: "2026-03-02",
    note: "Tyres",
    amount_cents: "90000",
    scheduled_cadence: null,
    excluded: true,
  },
];

const setup = (onSave = vi.fn()) => {
  render(
    <ReserveFitOneOffs
      candidates={CANDIDATES}
      onSave={onSave}
      format={(c: number) => `${Math.round(c / 100)} zl`}
    />,
  );
  return { onSave, user: userEvent.setup() };
};

const openDialog = async (user: ReturnType<typeof userEvent.setup>) => {
  await user.click(screen.getByTestId("reserve-fit-open-one-offs"));
  return screen.getByTestId("reserve-fit-one-offs-dialog");
};

describe("ReserveFitOneOffs", () => {
  // 260804: the trigger sits in the chart's corner, so it is an icon with a
  // count badge rather than a sentence.
  it("shows the number set aside on a badge, opening nothing", () => {
    setup();
    expect(screen.getByTestId("reserve-fit-one-offs-badge").textContent).toBe(
      "1",
    );
    expect(screen.queryByTestId("reserve-fit-one-offs-dialog")).toBeNull();
  });

  it("drops the badge when nothing is set aside", () => {
    render(
      <ReserveFitOneOffs
        candidates={CANDIDATES.map((c) => ({ ...c, excluded: false }))}
        onSave={vi.fn()}
        format={(c: number) => `${c}`}
      />,
    );
    expect(screen.queryByTestId("reserve-fit-one-offs-badge")).toBeNull();
    expect(screen.getByTestId("reserve-fit-open-one-offs")).toBeTruthy();
  });

  it("names itself for anyone who cannot see the icon", () => {
    setup();
    expect(
      screen
        .getByTestId("reserve-fit-open-one-offs")
        .getAttribute("aria-label"),
    ).toBeTruthy();
  });

  it("lists the counted spend biggest first, with category and date", async () => {
    const { user } = setup();
    const dialog = await openDialog(user);
    const counted = within(dialog).getByTestId("reserve-fit-counted");
    const rows = within(counted).getAllByTestId(/^reserve-fit-row-/);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual([
      "reserve-fit-row-tx-ins",
      "reserve-fit-row-tx-jump",
      "reserve-fit-row-tx-blank",
    ]);
    expect(rows[0]?.textContent).toContain("Car");
    // Localised, not the raw ISO the API sends.
    expect(rows[0]?.textContent).toContain("1 Sep 2025");
    // The note names WHICH spend it was — without it, three rows of the same
    // category and amount are indistinguishable (user, 260804).
    expect(rows[0]?.textContent).toContain("Insurance");
  });

  it("says nothing where a transaction has no note", async () => {
    const { user } = setup();
    const dialog = await openDialog(user);
    const row = within(dialog).getByTestId("reserve-fit-row-tx-blank");
    expect(row.textContent).toContain("Sport");
    expect(row.textContent).not.toContain("·  ·");
  });

  it("keeps what is already set aside in its own section on top", async () => {
    const { user } = setup();
    const dialog = await openDialog(user);
    const excluded = within(dialog).getByTestId("reserve-fit-excluded");
    expect(
      within(excluded).getByTestId("reserve-fit-row-tx-tyres"),
    ).toBeTruthy();
  });

  it("shows the cadence of a spend that will come round again", async () => {
    const { user } = setup();
    const dialog = await openDialog(user);
    expect(
      within(dialog).getByTestId("reserve-fit-recurs-tx-ins").textContent,
    ).toContain("YEARLY");
    expect(
      within(dialog).queryByTestId("reserve-fit-recurs-tx-jump"),
    ).toBeNull();
  });

  /**
   * "repeats yearly" is the one thing on the row that must not be missed — a
   * rare-and-certain charge is exactly what must NOT be ticked off as a one-off
   * — and it sat at the end of a truncating line, so a phone showed "repe…"
   * (user, 260810). It belongs beside the amount, where nothing crops it.
   */
  it("puts the repeat note beside the amount, not at the end of the details", async () => {
    const { user } = setup();
    const dialog = await openDialog(user);
    const badge = within(dialog).getByTestId("reserve-fit-recurs-tx-ins");
    const line = badge.parentElement!;
    // Same line as the figure…
    expect(line.textContent).toContain("5000");
    // …and out of the line that truncates.
    expect(line.className).not.toContain("truncate");
    expect(badge.className).toContain("shrink-0");
    const details = within(dialog)
      .getByTestId("reserve-fit-row-tx-ins")
      .querySelector(".truncate")!;
    expect(details.textContent).not.toContain("YEARLY");
  });

  /**
   * The dropdown listed categories in whatever order the reserve rows came in,
   * which is neither the spendings tab's order nor any order the household
   * recognises — and a category with no reserve row (opted out of the buffer)
   * was missing from it entirely (user, 260812).
   */
  it("lists the categories in the spendings order it is given", async () => {
    const user = userEvent.setup();
    render(
      <ReserveFitOneOffs
        candidates={CANDIDATES}
        // Sport is dragged last in the spendings tab, Car first.
        categoryOrder={["car", "insurance", "sport"]}
        onSave={vi.fn()}
        format={(c: number) => `${c}`}
      />,
    );
    await user.click(screen.getByTestId("reserve-fit-open-one-offs"));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByTestId("reserve-fit-category-filter"));
    const options = (await screen.findAllByTestId(/^reserve-fit-filter-/)).map(
      (o) => o.getAttribute("data-testid"),
    );
    expect(options).toEqual([
      "reserve-fit-filter-all",
      "reserve-fit-filter-car",
      "reserve-fit-filter-sport",
    ]);
  });

  it("still lists a category the given order has never heard of", async () => {
    const user = userEvent.setup();
    render(
      <ReserveFitOneOffs
        candidates={CANDIDATES}
        categoryOrder={["car"]}
        onSave={vi.fn()}
        format={(c: number) => `${c}`}
      />,
    );
    await user.click(screen.getByTestId("reserve-fit-open-one-offs"));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByTestId("reserve-fit-category-filter"));
    const options = (await screen.findAllByTestId(/^reserve-fit-filter-/)).map(
      (o) => o.getAttribute("data-testid"),
    );
    // Known ones in the order given, the rest after — never dropped.
    expect(options).toEqual([
      "reserve-fit-filter-all",
      "reserve-fit-filter-car",
      "reserve-fit-filter-sport",
    ]);
  });

  // Repeating charges no longer reach this dialog at all (they are not
  // one-offs). What can still arrive with a cadence is a ONCE payment — a
  // single planned purchase — and "repeats once" is nonsense (user, 260813).
  it("does not claim a one-time payment repeats", async () => {
    const user = userEvent.setup();
    render(
      <ReserveFitOneOffs
        candidates={[
          {
            ledger_id: "tx-sofa",
            category_id: "home",
            category_name: "Home",
            transaction_date: "2026-04-01",
            note: "Sofa",
            amount_cents: "200000",
            scheduled_cadence: "ONCE",
            excluded: false,
          },
        ]}
        onSave={vi.fn()}
        format={(c: number) => `${c}`}
      />,
    );
    await user.click(screen.getByTestId("reserve-fit-open-one-offs"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByTestId("reserve-fit-row-tx-sofa")).toBeTruthy();
    expect(
      within(dialog).queryByTestId("reserve-fit-recurs-tx-sofa"),
    ).toBeNull();
  });

  /**
   * The list is no longer a shortlist: every spend in the range is offered, ten
   * at a time, and the button at the end asks for the next ten (user, 260813).
   */
  it("asks for more when the button is pressed", async () => {
    const onLoadMore = vi.fn();
    const user = userEvent.setup();
    render(
      <ReserveFitOneOffs
        candidates={CANDIDATES}
        hasMore
        onLoadMore={onLoadMore}
        onSave={vi.fn()}
        format={(c: number) => `${c}`}
      />,
    );
    await user.click(screen.getByTestId("reserve-fit-open-one-offs"));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByTestId("reserve-fit-load-more"));
    expect(onLoadMore).toHaveBeenCalled();
  });

  it("says nothing about more when there is no more", async () => {
    const user = userEvent.setup();
    render(
      <ReserveFitOneOffs
        candidates={CANDIDATES}
        hasMore={false}
        onSave={vi.fn()}
        format={(c: number) => `${c}`}
      />,
    );
    await user.click(screen.getByTestId("reserve-fit-open-one-offs"));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).queryByTestId("reserve-fit-load-more")).toBeNull();
  });

  // Filtering has to reach the SERVER now — a category's spends may sit on a
  // page nobody has loaded, so narrowing the loaded rows would lie.
  it("reports the chosen category instead of filtering what is loaded", async () => {
    const onCategoryChange = vi.fn();
    const user = userEvent.setup();
    render(
      <ReserveFitOneOffs
        candidates={CANDIDATES}
        categories={[
          { id: "car", name: "Car" },
          { id: "sport", name: "Sport" },
          { id: "quiet", name: "Quiet" },
        ]}
        category="all"
        onCategoryChange={onCategoryChange}
        onSave={vi.fn()}
        format={(c: number) => `${c}`}
      />,
    );
    await user.click(screen.getByTestId("reserve-fit-open-one-offs"));
    const dialog = await screen.findByRole("dialog");
    await user.click(within(dialog).getByTestId("reserve-fit-category-filter"));
    // …every category is offered, even one with nothing loaded against it.
    expect(await screen.findByTestId("reserve-fit-filter-quiet")).toBeTruthy();
    await user.click(screen.getByTestId("reserve-fit-filter-sport"));
    expect(onCategoryChange).toHaveBeenCalledWith("sport");
  });

  it("filters the list down to one category", async () => {
    const { user } = setup();
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByTestId("reserve-fit-category-filter"));
    await user.click(await screen.findByTestId("reserve-fit-filter-sport"));
    expect(within(dialog).queryByTestId("reserve-fit-row-tx-ins")).toBeNull();
    expect(within(dialog).getByTestId("reserve-fit-row-tx-jump")).toBeTruthy();
  });

  // No Save button to forget: flipping the switch IS the decision (user, 260804).
  it("saves the moment a spend is set aside", async () => {
    const { user, onSave } = setup();
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByTestId("reserve-fit-toggle-tx-jump"));
    expect(onSave).toHaveBeenCalledWith({ add: ["tx-jump"], remove: [] });
  });

  it("saves the moment one is counted again", async () => {
    const { user, onSave } = setup();
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByTestId("reserve-fit-toggle-tx-tyres"));
    expect(onSave).toHaveBeenCalledWith({ add: [], remove: ["tx-tyres"] });
  });

  it("moves the row into the other section as soon as it flips", async () => {
    const { user } = setup();
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByTestId("reserve-fit-toggle-tx-jump"));
    const excluded = within(dialog).getByTestId("reserve-fit-excluded");
    expect(
      within(excluded).getByTestId("reserve-fit-row-tx-jump"),
    ).toBeTruthy();
  });

  it("has no Save or Cancel to press", async () => {
    const { user } = setup();
    const dialog = await openDialog(user);
    expect(within(dialog).queryByTestId("reserve-fit-save")).toBeNull();
    expect(within(dialog).queryByTestId("reserve-fit-cancel")).toBeNull();
  });

  it("does not open the category picker by itself", async () => {
    const { user } = setup();
    const dialog = await openDialog(user);
    // The filter must not be focused on open — on iOS that threw up the wheel.
    expect(document.activeElement).not.toBe(
      within(dialog).getByTestId("reserve-fit-category-filter"),
    );
    expect(screen.queryByTestId("reserve-fit-filter-sport")).toBeNull();
  });

  it("says nothing at all when there is no large spend to judge", () => {
    render(
      <ReserveFitOneOffs
        candidates={[]}
        onSave={vi.fn()}
        format={(c: number) => `${c}`}
      />,
    );
    expect(screen.queryByTestId("reserve-fit-open-one-offs")).toBeNull();
  });
});
