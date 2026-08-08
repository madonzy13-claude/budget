/**
 * limit-rebalance.test.tsx — acting on "how much each limit should change"
 * (260808).
 *
 * The Future reading of that chart says what each limit ought to become. This
 * dialog is where it gets written, and because a limit is STORED as a needs
 * figure and a wants figure, each row shows both sides: what they are now,
 * which cannot be typed into, beside what they should become, which can.
 *
 * Same contract as the reserve dialog it is modelled on: one button per row
 * that moves or takes back, visibly inert on a limit already where it should
 * be, and a queue that settles once when the dialog opens.
 */
import { describe, it, expect, vi } from "vitest";
import messages from "../../../../messages/en.json";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("next-intl", () => ({
  useTranslations:
    (ns: string) => (key: string, vars?: Record<string, unknown>) => {
      const path = `${ns}.${key}`.split(".");
      let node: unknown = messages;
      for (const part of path) {
        node = (node as Record<string, unknown> | undefined)?.[part];
        if (node === undefined)
          throw new Error(`missing i18n key: ${path.join(".")}`);
      }
      return vars ? `${key}:${Object.values(vars).join(",")}` : key;
    },
  useLocale: () => "en",
}));

const { LimitRebalance } = await import(
  "@/components/budgeting/overview/limit-rebalance"
);

/** Car should rise to 1,500; Food is already right; Sport splits 60/40. */
const ROWS = [
  {
    categoryId: "car",
    name: "Car",
    needsCents: 100_000,
    wantsCents: 0,
    suggestedLimitCents: 150_000,
  },
  {
    categoryId: "food",
    name: "Food",
    needsCents: 80_000,
    wantsCents: 20_000,
    suggestedLimitCents: 100_000,
  },
  {
    categoryId: "sport",
    name: "Sport",
    needsCents: 60_000,
    wantsCents: 40_000,
    suggestedLimitCents: 150_000,
  },
];

const format = (c: number) => `${(c / 100).toFixed(2)} zl`;

async function open(
  onApply = vi.fn(async () => {}),
  rows: typeof ROWS = ROWS,
) {
  const user = userEvent.setup();
  render(<LimitRebalance rows={rows} onApply={onApply} format={format} />);
  await user.click(screen.getByTestId("limit-rebalance-open"));
  return { user, onApply };
}

const needs = (id: string) =>
  screen.getByTestId(`limit-rebalance-needs-${id}`) as HTMLInputElement;
const wants = (id: string) =>
  screen.getByTestId(`limit-rebalance-wants-${id}`) as HTMLInputElement;
const action = (id: string) =>
  screen.getByTestId(`limit-rebalance-action-${id}`) as HTMLButtonElement;

describe("LimitRebalance", () => {
  it("shows what each side is now, and cannot be typed into", async () => {
    await open();
    expect(
      screen.getByTestId("limit-rebalance-prev-needs-sport").textContent,
    ).toBe("600.00 zl");
    expect(
      screen.getByTestId("limit-rebalance-prev-wants-sport").textContent,
    ).toBe("400.00 zl");
    // They are figures, not fields.
    expect(
      screen.queryByTestId("limit-rebalance-prev-needs-sport"),
    ).not.toBeInstanceOf(HTMLInputElement);
  });

  it("proposes the new split in the proportions the category already keeps", async () => {
    await open();
    // Sport is 60/40 and should total 1,500 → 900 and 600.
    expect(needs("sport").value).toBe("900");
    expect(wants("sport").value).toBe("600");
  });

  it("leaves a category that never split its limit on needs alone", async () => {
    await open();
    expect(needs("car").value).toBe("1500");
    expect(wants("car").value).toBe("0");
  });

  it("writes the split the member settled on", async () => {
    const { user, onApply } = await open();
    await user.clear(needs("sport"));
    await user.type(needs("sport"), "1000");
    await user.click(action("sport"));
    await waitFor(() =>
      expect(onApply).toHaveBeenCalledWith("sport", {
        needsCents: 100_000,
        wantsCents: 60_000,
      }),
    );
  });

  it("takes a comma as readily as a dot", async () => {
    // The Polish keyboard's decimal key is a comma.
    const { user, onApply } = await open();
    await user.clear(wants("car"));
    await user.type(wants("car"), "12,34");
    await user.click(action("car"));
    await waitFor(() =>
      expect(onApply).toHaveBeenCalledWith("car", {
        needsCents: 150_000,
        wantsCents: 1234,
      }),
    );
  });

  it("goes inert on a limit that is already what it should be", async () => {
    await open();
    expect(action("food").disabled).toBe(true);
    expect(action("car").disabled).toBe(false);
  });

  it("offers to undo after a move, and puts the old split back", async () => {
    const { user, onApply } = await open();
    await user.click(action("car"));
    await waitFor(() =>
      expect(action("car").dataset["kind"]).toBe("undo"),
    );
    await user.click(action("car"));
    await waitFor(() =>
      expect(onApply).toHaveBeenLastCalledWith("car", {
        needsCents: 100_000,
        wantsCents: 0,
      }),
    );
  });

  it("re-arms a moved row the moment a new figure is typed", async () => {
    const { user } = await open();
    await user.click(action("car"));
    await waitFor(() => expect(action("car").dataset["kind"]).toBe("undo"));
    await user.clear(needs("car"));
    await user.type(needs("car"), "1600");
    expect(action("car").dataset["kind"]).toBe("rebalance");
  });

  it("queues the biggest change first and the settled row last", async () => {
    await open();
    const order = screen
      .getAllByTestId(/^limit-rebalance-row-/)
      .map((el) => el.getAttribute("data-category"));
    expect(order).toEqual(["car", "sport", "food"]);
  });

  // ── What it looks like (user, 260808) ────────────────────────────────────
  //
  // The reserve dialog reads "holds → should hold" with an arrow between the
  // two and the row's own colour down its left edge. This one had neither, so
  // two dialogs doing the same job looked unrelated.
  it("points from what the limit is to what it should be", async () => {
    await open();
    const row = screen.getByTestId("limit-rebalance-row-car");
    // One arrow per editable side, so each line reads left to right.
    expect(row.querySelectorAll("svg.lucide-arrow-right").length).toBe(2);
  });

  it("lines every arrow up in one column", async () => {
    // "150 zł →" and "3,233 zł →" put their arrows in different places, so the
    // eye had to find the line again on every row (user, 260808). The figure
    // gets ONE width, sized to the widest of them, exactly as the reserve
    // dialog already does.
    await open();
    const widths = screen
      .getAllByTestId(/^limit-rebalance-prev-/)
      .map((el) => (el as HTMLElement).style.width);
    expect(widths.every((w) => w !== "")).toBe(true);
    expect(new Set(widths).size).toBe(1);
  });

  it("says what the arrow means, for anyone who cannot see it", async () => {
    await open();
    const arrow = screen
      .getByTestId("limit-rebalance-row-car")
      .querySelector("svg.lucide-arrow-right")!;
    expect(arrow.getAttribute("aria-hidden")).not.toBe("true");
    expect(arrow.getAttribute("aria-label")).toBe("planned.becomes");
  });

  it("carries the row's own colour, red when the limit has to rise", async () => {
    await open();
    // Car must go 1,000 → 1,500: under-budgeted, which is the shortfall colour.
    expect(
      screen.getByTestId("limit-rebalance-row-car").dataset["color"],
    ).toBe("var(--trading-down)");
    // Sport is 1,000 → 1,500 as well; Food is already right, so it is neither.
    expect(
      screen.getByTestId("limit-rebalance-row-food").dataset["color"],
    ).toBe("var(--muted-foreground)");
  });

  it("is amber when the limit can come down", async () => {
    await open(vi.fn(async () => {}), [
      {
        categoryId: "slack",
        name: "Slack",
        needsCents: 200_000,
        wantsCents: 0,
        suggestedLimitCents: 100_000,
      },
    ]);
    expect(
      screen.getByTestId("limit-rebalance-row-slack").dataset["color"],
    ).toBe("var(--primary)");
  });

  it("gives the move a real call to action, and the reversal a quieter one", async () => {
    const { user } = await open();
    // The yellow compact CTA the dense trader rows use — not a grey chip that
    // reads as a label (user, 260808).
    expect(action("car").className).toContain("bg-[var(--primary)]");
    await user.click(action("car"));
    await waitFor(() => expect(action("car").dataset["kind"]).toBe("undo"));
    // Undo is a reversal: still a button, but it must not compete with the CTA.
    expect(action("car").className).not.toContain("bg-[var(--primary)]");
    expect(action("car").className).toContain("border");
  });

  it("stays out of the way when no limit needs changing", () => {
    render(
      <LimitRebalance
        rows={[]}
        onApply={vi.fn(async () => {})}
        format={format}
      />,
    );
    expect(screen.queryByTestId("limit-rebalance-open")).toBeNull();
  });
});
