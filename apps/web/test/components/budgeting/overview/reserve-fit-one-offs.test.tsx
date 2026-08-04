/**
 * reserve-fit-one-offs.test.tsx — the one-off dialog (260804 redesign).
 *
 * The per-row accordions were noise. One link under the chart opens a dialog
 * listing every large spend, biggest first, with its category and date; the ones
 * already set aside sit in their own section at the top. Decisions are STAGED —
 * nothing is written until Save — so the member can look at the whole picture
 * before committing, and Cancel really does nothing.
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
    ledger_id: "tx-jump",
    category_id: "sport",
    category_name: "Sport",
    transaction_date: "2026-03-14",
    note: "Parachute jump",
    amount_cents: "480000",
    recurring_cadence: null,
    excluded: false,
  },
  {
    ledger_id: "tx-ins",
    category_id: "car",
    category_name: "Car",
    transaction_date: "2025-09-01",
    note: "Insurance",
    amount_cents: "500000",
    recurring_cadence: "YEARLY",
    excluded: false,
  },
  {
    ledger_id: "tx-tyres",
    category_id: "car",
    category_name: "Car",
    transaction_date: "2026-03-02",
    note: "Tyres",
    amount_cents: "90000",
    recurring_cadence: null,
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
  it("summarises how many spends are set aside, without opening anything", () => {
    setup();
    expect(
      screen.getByTestId("reserve-fit-open-one-offs").textContent,
    ).toContain("1");
    expect(screen.queryByTestId("reserve-fit-one-offs-dialog")).toBeNull();
  });

  it("lists the counted spend biggest first, with category and date", async () => {
    const { user } = setup();
    const dialog = await openDialog(user);
    const counted = within(dialog).getByTestId("reserve-fit-counted");
    const rows = within(counted).getAllByTestId(/^reserve-fit-row-/);
    expect(rows.map((r) => r.getAttribute("data-testid"))).toEqual([
      "reserve-fit-row-tx-ins",
      "reserve-fit-row-tx-jump",
    ]);
    expect(rows[0]?.textContent).toContain("Car");
    expect(rows[0]?.textContent).toContain("2025-09-01");
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

  it("filters the list down to one category", async () => {
    const { user } = setup();
    const dialog = await openDialog(user);
    await user.selectOptions(
      within(dialog).getByTestId("reserve-fit-category-filter"),
      "sport",
    );
    expect(within(dialog).queryByTestId("reserve-fit-row-tx-ins")).toBeNull();
    expect(within(dialog).getByTestId("reserve-fit-row-tx-jump")).toBeTruthy();
  });

  it("moves a staged spend into the excluded section without saving", async () => {
    const { user, onSave } = setup();
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByTestId("reserve-fit-toggle-tx-jump"));
    const excluded = within(dialog).getByTestId("reserve-fit-excluded");
    expect(
      within(excluded).getByTestId("reserve-fit-row-tx-jump"),
    ).toBeTruthy();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("saves only what actually changed", async () => {
    const { user, onSave } = setup();
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByTestId("reserve-fit-toggle-tx-jump"));
    await user.click(within(dialog).getByTestId("reserve-fit-toggle-tx-tyres"));
    await user.click(within(dialog).getByTestId("reserve-fit-save"));
    expect(onSave).toHaveBeenCalledWith({
      add: ["tx-jump"],
      remove: ["tx-tyres"],
    });
  });

  it("throws staged decisions away on cancel", async () => {
    const { user, onSave } = setup();
    const dialog = await openDialog(user);
    await user.click(within(dialog).getByTestId("reserve-fit-toggle-tx-jump"));
    await user.click(within(dialog).getByTestId("reserve-fit-cancel"));
    expect(onSave).not.toHaveBeenCalled();
    // Re-opening shows the server's answer again, not the abandoned staging.
    const reopened = await openDialog(user);
    const counted = within(reopened).getByTestId("reserve-fit-counted");
    expect(within(counted).getByTestId("reserve-fit-row-tx-jump")).toBeTruthy();
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
