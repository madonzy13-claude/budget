/**
 * quick-entry-double-submit.test.tsx — one Enter must not spend twice (260806).
 *
 * `submit()` clears the field and then mutates, and `handleBlur` saves whatever
 * is still in the field. React state is asynchronous, so the blur that follows
 * an Enter — moving to another tab, tapping elsewhere, the E2E navigating on —
 * ran with the OLD value still in the closure and posted the amount a second
 * time. The reserves E2E caught it as a reserve drawn to zero: 180 typed once
 * arrived as 360, whose overage swallowed the whole buffer.
 *
 * The edge-hop paths already guarded against exactly this; Enter did not.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

const mutate = vi.fn();

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("@/hooks/use-create-transaction", () => ({
  useCreateTransaction: () => ({ mutate }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

const { QuickEntryInput } = await import(
  "@/components/budgeting/spendings-grid/quick-entry-input"
);

function setup() {
  render(
    <QuickEntryInput
      categoryId="c1"
      categoryName="Groceries"
      budgetId="b1"
      month="2026-08"
      budgetCurrency="EUR"
      resolvedDate="2026-08-06"
    />,
  );
  return screen.getByTestId("quick-entry-groceries") as HTMLInputElement;
}

beforeEach(() => {
  mutate.mockClear();
  Object.defineProperty(navigator, "onLine", {
    configurable: true,
    value: true,
  });
});

describe("Quick entry — one Enter, one transaction", () => {
  it("saves once when Enter is followed by a blur", async () => {
    const user = userEvent.setup();
    const input = setup();

    await user.click(input);
    await user.type(input, "180.00");
    await user.keyboard("{Enter}");
    // Whatever happens next — another tab, a tap elsewhere — blurs the field.
    await user.tab();

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toMatchObject({ amountCents: 18000 });
  });

  it("still saves on a blur that no Enter preceded", async () => {
    const user = userEvent.setup();
    const input = setup();

    await user.click(input);
    await user.type(input, "12.50");
    await user.tab();

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toMatchObject({ amountCents: 1250 });
  });

  // The guard must not outlive the blur it was set for, or the NEXT entry
  // would be swallowed.
  it("saves the next entry after an Enter-then-blur", async () => {
    const user = userEvent.setup();
    const input = setup();

    await user.click(input);
    await user.type(input, "180.00");
    await user.keyboard("{Enter}");
    await user.tab();
    mutate.mockClear();

    await user.click(input);
    await user.type(input, "7.00");
    await user.tab();

    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toMatchObject({ amountCents: 700 });
  });

  // The guard must not survive into a LATER entry: a blur-save sets it too, and
  // if it were still set when the next blur came round that entry would vanish
  // without a word — worse than the double it exists to prevent.
  it("saves a second entry that is also committed by blur alone", async () => {
    const user = userEvent.setup();
    const input = setup();

    await user.click(input);
    await user.type(input, "12.50");
    await user.tab();
    expect(mutate).toHaveBeenCalledTimes(1);

    await user.click(input);
    await user.type(input, "3.25");
    await user.tab();

    expect(mutate).toHaveBeenCalledTimes(2);
    expect(mutate.mock.calls[1]![0]).toMatchObject({ amountCents: 325 });
  });

  it("saves nothing when Enter is pressed on an empty field", async () => {
    const user = userEvent.setup();
    const input = setup();

    await user.click(input);
    await user.keyboard("{Enter}");
    await user.tab();

    expect(mutate).not.toHaveBeenCalled();
  });
});
