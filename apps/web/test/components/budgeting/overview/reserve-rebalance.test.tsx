/**
 * reserve-rebalance.test.tsx — moving the money the fit chart asked for (260805).
 *
 * The chart says which buffers are the wrong size. This dialog is where they are
 * put right: one row per reserve, what it holds beside what it should hold, and
 * a single button that does the move — or takes it back.
 *
 * What is worth pinning down here:
 *   - the ORDER is the queue: short, then fat, then settled, settled ONCE when
 *     the dialog opens and held from then on;
 *   - a row already on its target has a VISIBLY inert button, not a missing one;
 *   - the target field takes a comma as readily as a dot (the Polish keyboard's
 *     decimal key), and typing a new one re-arms a row that was already moved;
 *   - a row's colour is the bar's colour, from the same function.
 */
import { describe, it, expect, vi } from "vitest";
import messages from "../../../../messages/en.json";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { reserveFitColor } from "@/components/budgeting/charts/diverging-bar-chart";

vi.mock("next-intl", () => ({
  // Echoes the key, but resolves it against the real en.json first and throws
  // when it is missing — a typo'd key renders as MISSING_MESSAGE in production
  // while a naive mock keeps every test green (260804).
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

const { ReserveRebalance } = await import(
  "@/components/budgeting/overview/reserve-rebalance"
);

/** Car is short, Sport is fat, Newborn and Food are already right. */
const ROWS = [
  { categoryId: "car", name: "Car", heldCents: 100_000, neededCents: 500_000 },
  { categoryId: "sport", name: "Sport", heldCents: 460_000, neededCents: 0 },
  { categoryId: "newborn", name: "Newborn", heldCents: 0, neededCents: 0 },
  {
    categoryId: "food",
    name: "Food",
    heldCents: 100_000,
    neededCents: 100_000,
  },
];

// The dialog is handed an EXACT formatter, not the chart's rounded one: a
// target typed as 661.63 next to a current of "662 zł" reads as a mismatch that
// isn't there (user screenshot, 260805).
const format = (c: number) => `${(c / 100).toFixed(2)} zl`;

async function open(
  onRebalance: (id: string, cents: number) => Promise<number> = vi.fn(
    async (_id: string, cents: number) => cents,
  ),
  rows = ROWS,
) {
  const user = userEvent.setup();
  render(
    <ReserveRebalance rows={rows} onRebalance={onRebalance} format={format} />,
  );
  await user.click(screen.getByTestId("reserve-rebalance-open"));
  return { user, onRebalance };
}

const order = () =>
  screen
    .getAllByTestId(/^reserve-rebalance-row-/)
    .map((el) => el.getAttribute("data-category"));

const action = (id: string) =>
  screen.getByTestId(`reserve-rebalance-action-${id}`);

const target = (id: string) =>
  screen.getByTestId(`reserve-rebalance-target-${id}`) as HTMLInputElement;

describe("ReserveRebalance", () => {
  it("opens from its own trigger and lists every reserve", async () => {
    await open();
    expect(screen.getByTestId("reserve-rebalance-dialog")).toBeTruthy();
    expect(order()).toHaveLength(4);
  });

  // Red, then yellow, then grey (user, 260805).
  // Biggest move first, whichever way it points (user, 260808) — Sport's 4,600
  // coming back out is a bigger thing to deal with than Car's 4,000 going in.
  // Supersedes the short-then-fat banding of 260805.
  it("queues the biggest move first and the settled last", async () => {
    await open();
    expect(order()).toEqual(["sport", "car", "newborn", "food"]);
  });

  it("paints each row the colour its bar has", async () => {
    await open();
    const colorOf = (id: string) =>
      screen
        .getByTestId(`reserve-rebalance-row-${id}`)
        .getAttribute("data-color");
    // −80%, +100%, and flat — straight through the chart's own function.
    expect(colorOf("car")).toBe(reserveFitColor(-80));
    expect(colorOf("sport")).toBe(reserveFitColor(100));
    expect(colorOf("newborn")).toBe(reserveFitColor(0));
    // …and those are three DIFFERENT colours, so the row really is banded.
    expect(new Set([colorOf("car"), colorOf("sport"), colorOf("newborn")]).size)
      .toBe(3);
  });

  it("shows what each reserve holds against what it should", async () => {
    await open();
    expect(
      screen.getByTestId("reserve-rebalance-current-car").textContent,
    ).toBe("1000.00 zl");
    expect(target("car").value).toBe("5000");
  });

  // The move figure is GONE (user screenshot, 260808). It restated what the
  // two figures already beside it say — a reserve holding 4,283 with a target
  // of 894 is plainly giving 3,389 back — and it was the loudest thing on a
  // card whose actual subject is the target you can edit.
  it("does not restate the move as a third figure", () => {
    return open().then(() => {
      expect(screen.queryByTestId("reserve-rebalance-move-car")).toBeNull();
      expect(screen.queryByTestId("reserve-rebalance-move-sport")).toBeNull();
    });
  });

  // …and with it gone the FIELD closes that line, flush to the card's right
  // edge under the button, so both lines end in the same place instead of the
  // second one trailing off into the hole the figure left.
  //
  // All three on one line was tried and does not fit a 390px phone: the widest
  // figure is a third of the width and "Збалансувати" is twice "Rebalance",
  // which cut the target field down to "16077." (verified at 390px, 260808).
  it("ends both lines at the same edge", async () => {
    await open();
    const field = screen.getByTestId("reserve-rebalance-target-car");
    const controls = field.closest("div")!;
    expect(
      controls.contains(screen.getByTestId("reserve-rebalance-current-car")),
    ).toBe(true);
    expect(
      controls.contains(screen.getByTestId("reserve-rebalance-action-car")),
    ).toBe(false);
    // ml-auto is what pushes it to the edge the button sits on.
    expect(field.className).toContain("ml-auto");
  });

  // Nobody moves 661.63 (user, 260808). The walk answers to the groszy; the
  // figure someone is asked to act on is whole.
  it("proposes a whole target, never a decimal", async () => {
    await open(vi.fn(async (_id: string, cents: number) => cents), [
      {
        categoryId: "odd",
        name: "Odd",
        heldCents: 10_000,
        neededCents: 66_163,
      },
    ]);
    expect(target("odd").value).toBe("662");
  });

  // The move is the thing to press, so it looks like it (user, 260808). A grey
  // chip beside a grey figure read as a label.
  it("gives the move a real call to action, and the reversal a quieter one", async () => {
    const { user } = await open();
    expect(action("car").className).toContain("bg-[var(--primary)]");
    await user.click(action("car"));
    await waitFor(() => expect(action("car").dataset["kind"]).toBe("undo"));
    expect(action("car").className).not.toContain("bg-[var(--primary)]");
    expect(action("car").className).toContain("border");
  });

  // "If current and Target value are same, but it wasn't rebalanced — just make
  // button not active" (user, 260805).
  it("leaves the button inert on a reserve that is already right", async () => {
    await open();
    expect((action("food") as HTMLButtonElement).disabled).toBe(true);
    expect((action("car") as HTMLButtonElement).disabled).toBe(false);
  });

  it("moves the reserve to its target and offers the way back", async () => {
    const onRebalance = vi.fn(async (_id: string, cents: number) => cents);
    const { user } = await open(onRebalance);

    await user.click(action("car"));

    expect(onRebalance).toHaveBeenCalledWith("car", 500_000);
    await waitFor(() =>
      expect(action("car").getAttribute("data-kind")).toBe("undo"),
    );
    // The current value follows the move, so the row reads as done.
    expect(
      screen.getByTestId("reserve-rebalance-current-car").textContent,
    ).toBe("5000.00 zl");
  });

  // The engine can settle BELOW the typed target when the raise covered this
  // month's overspend — the row must show what actually happened, not what was
  // asked for.
  it("shows the reserve the server settled on, not the one that was asked for", async () => {
    const { user } = await open(vi.fn(async () => 320_000));
    await user.click(action("car"));
    await waitFor(() =>
      expect(
        screen.getByTestId("reserve-rebalance-current-car").textContent,
      ).toBe("3200.00 zl"),
    );
  });

  // …and it must SAY where the rest went, or the press reads as having done
  // nothing: the reserve is still short, and nothing on the row explains why.
  it("says how much of the move went to covering overspending", async () => {
    const { user } = await open(vi.fn(async () => 320_000));
    await user.click(action("car"));
    await waitFor(() =>
      expect(
        screen.getByTestId("reserve-rebalance-covered-car").textContent,
      ).toContain("1800.00 zl"),
    );
  });

  it("stays quiet when the whole move landed in the buffer", async () => {
    const { user } = await open();
    await user.click(action("car"));
    await waitFor(() =>
      expect(action("car").getAttribute("data-kind")).toBe("undo"),
    );
    expect(screen.queryByTestId("reserve-rebalance-covered-car")).toBeNull();
  });

  it("drops the covering note when the move is taken back", async () => {
    const onRebalance = vi
      .fn<(id: string, cents: number) => Promise<number>>()
      .mockResolvedValueOnce(320_000)
      .mockResolvedValue(100_000);
    const { user } = await open(onRebalance);

    await user.click(action("car"));
    await waitFor(() =>
      expect(screen.getByTestId("reserve-rebalance-covered-car")).toBeTruthy(),
    );
    // The buffer did take 2,200 of it, so the move is still reversible.
    expect(action("car").getAttribute("data-kind")).toBe("rebalance");

    // Retarget to what it now holds so the button offers the way back…
    await user.clear(target("car"));
    await user.type(target("car"), "3200");
    expect(action("car").getAttribute("data-kind")).toBe("undo");
    await user.click(action("car"));

    await waitFor(() =>
      expect(screen.queryByTestId("reserve-rebalance-covered-car")).toBeNull(),
    );
  });

  // The queue is settled when the dialog opens and then holds: a row that
  // re-files itself the moment you act on it moves the NEXT row under the
  // finger that is already going for it (user, 260805).
  it("keeps the queue in the order it opened with", async () => {
    const { user } = await open();
    await user.click(action("car"));
    await waitFor(() =>
      expect(action("car").getAttribute("data-kind")).toBe("undo"),
    );
    // Car is on its target now and would sort last — it stays where it was.
    expect(order()).toEqual(["sport", "car", "newborn", "food"]);
  });

  it("sorts afresh the next time it is opened", async () => {
    const { user } = await open();
    await user.click(action("car"));
    await waitFor(() =>
      expect(action("car").getAttribute("data-kind")).toBe("undo"),
    );

    await user.keyboard("{Escape}");
    await user.click(screen.getByTestId("reserve-rebalance-open"));

    // A fresh queue: the fat reserve is the only thing left to do.
    await waitFor(() =>
      expect(order()).toEqual(["sport", "car", "newborn", "food"]),
    );
  });

  it("puts the reserve back where it was", async () => {
    const onRebalance = vi.fn(async (_id: string, cents: number) => cents);
    const { user } = await open(onRebalance);

    await user.click(action("car"));
    await waitFor(() =>
      expect(action("car").getAttribute("data-kind")).toBe("undo"),
    );
    await user.click(action("car"));

    expect(onRebalance).toHaveBeenLastCalledWith("car", 100_000);
    await waitFor(() =>
      expect(action("car").getAttribute("data-kind")).toBe("rebalance"),
    );
    expect(
      screen.getByTestId("reserve-rebalance-current-car").textContent,
    ).toBe("1000.00 zl");
  });

  it("takes a comma as readily as a dot", async () => {
    const onRebalance = vi.fn(async (_id: string, cents: number) => cents);
    const { user } = await open(onRebalance);

    await user.clear(target("car"));
    await user.type(target("car"), "1234,56");
    await user.click(action("car"));

    expect(onRebalance).toHaveBeenCalledWith("car", 123_456);
  });

  // "If user change the target value and amounts differs — activate rebalance
  // button again" (user, 260805).
  it("re-arms a settled row when its target is changed", async () => {
    const { user } = await open();
    expect((action("food") as HTMLButtonElement).disabled).toBe(true);

    await user.clear(target("food"));
    await user.type(target("food"), "2000");

    expect((action("food") as HTMLButtonElement).disabled).toBe(false);
    expect(action("food").getAttribute("data-kind")).toBe("rebalance");
  });

  it("re-arms an already-moved row when its target is changed", async () => {
    const onRebalance = vi.fn(async (_id: string, cents: number) => cents);
    const { user } = await open(onRebalance);

    await user.click(action("car"));
    await waitFor(() =>
      expect(action("car").getAttribute("data-kind")).toBe("undo"),
    );

    await user.clear(target("car"));
    await user.type(target("car"), "6000");
    expect(action("car").getAttribute("data-kind")).toBe("rebalance");

    await user.click(action("car"));
    expect(onRebalance).toHaveBeenLastCalledWith("car", 600_000);
  });

  // Undo goes back to where the member STARTED, not to the middle of a series
  // of tries — otherwise a second move strands the money somewhere nobody chose.
  it("takes a twice-moved reserve back to where it started", async () => {
    const onRebalance = vi.fn(async (_id: string, cents: number) => cents);
    const { user } = await open(onRebalance);

    await user.click(action("car"));
    await waitFor(() =>
      expect(action("car").getAttribute("data-kind")).toBe("undo"),
    );
    await user.clear(target("car"));
    await user.type(target("car"), "6000");
    await user.click(action("car"));
    await waitFor(() =>
      expect(action("car").getAttribute("data-kind")).toBe("undo"),
    );
    await user.click(action("car"));

    expect(onRebalance).toHaveBeenLastCalledWith("car", 100_000);
  });

  // …including while a target is being typed, which would otherwise slide the
  // row out from under the finger holding it.
  it("holds the order still while a target is being typed", async () => {
    const { user } = await open();
    await user.clear(target("car"));
    await user.type(target("car"), "1000");
    expect(order()).toEqual(["sport", "car", "newborn", "food"]);
    await user.tab();
    expect(order()).toEqual(["sport", "car", "newborn", "food"]);
  });

  // Undo is a real button, not a link dressed as one: it undoes a money move,
  // and it has to look as pressable as the button it replaced (user, 260805).
  it("gives undo a button's own outline", async () => {
    const { user } = await open();
    await user.click(action("car"));
    await waitFor(() =>
      expect(action("car").getAttribute("data-kind")).toBe("undo"),
    );
    const cls = action("car").className;
    expect(cls).toContain("border");
    expect(cls).not.toContain("underline");
  });

  it("stays out of the way when no reserve has anything to move", async () => {
    render(
      <ReserveRebalance
        rows={[]}
        onRebalance={vi.fn(async () => 0)}
        format={format}
      />,
    );
    expect(screen.queryByTestId("reserve-rebalance-open")).toBeNull();
  });
});
