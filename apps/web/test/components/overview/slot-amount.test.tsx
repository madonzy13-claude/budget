import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import {
  SlotAmount,
  SlotRevealProvider,
} from "@/components/budgeting/overview/slot-amount";

// Two-phase flush: the click flips the (shared) reveal state and its effect
// schedules the scramble interval; a separate act then runs the timers to settle.
function clickAndSettle(el: HTMLElement) {
  act(() => {
    fireEvent.click(el);
  });
  act(() => {
    vi.runAllTimers();
  });
}

describe("SlotAmount", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  // The per-char spans hold the blur; the currency ("$") span stays sharp.
  const charSpans = (el: HTMLElement) =>
    Array.from(el.querySelectorAll("span"));
  const blurredChars = (el: HTMLElement) =>
    charSpans(el).filter((s) => s.style.filter.includes("blur"));
  const currencySpan = (el: HTMLElement) =>
    charSpans(el).find((s) => s.textContent === "$");

  it("starts hidden: number (digits AND separators) scrambled to uppercase + blurred; currency kept sharp", () => {
    render(<SlotAmount value="$1,234" />);
    const el = screen.getByTestId("slot-amount");
    expect(el.dataset.revealed).toBe("false");
    expect(el.textContent).not.toMatch(/\d/); // real digits NOT in the DOM
    expect(el.textContent).not.toContain(","); // the comma is scrambled too (split hidden)
    expect(el.textContent).toContain("$"); // currency not scrambled
    expect(el.textContent).not.toMatch(/[a-z]/); // uppercase only
    expect(el.textContent).toMatch(/[A-Z]/); // random uppercase chars present
    // Every number slot (4 digits + the comma position = 5) is blurred (em radius).
    expect(blurredChars(el).length).toBe(5);
    expect(blurredChars(el)[0]!.style.filter).toContain("em");
    expect(currencySpan(el)!.style.filter).toBe("none"); // currency NOT blurred
  });

  it("reveals the real value on click (all sharp), re-hides on a second click", () => {
    render(<SlotAmount value="$1,234" />);
    const el = screen.getByTestId("slot-amount");
    clickAndSettle(el);
    expect(el.dataset.revealed).toBe("true");
    expect(el.textContent).toBe("$1,234");
    expect(blurredChars(el).length).toBe(0); // nothing blurred when revealed
    clickAndSettle(el);
    expect(el.dataset.revealed).toBe("false");
    expect(el.textContent).not.toMatch(/\d/);
    expect(blurredChars(el).length).toBeGreaterThan(0); // digits blurred again
  });

  it("Enter toggles the reveal", () => {
    render(<SlotAmount value="42" />);
    const el = screen.getByTestId("slot-amount");
    act(() => {
      fireEvent.keyDown(el, { key: "Enter" });
    });
    act(() => {
      vi.runAllTimers();
    });
    expect(el.textContent).toBe("42");
  });

  it("negative sign is preserved (not scrambled)", () => {
    render(<SlotAmount value="-50 zł" />);
    const el = screen.getByTestId("slot-amount");
    expect(el.textContent).toContain("-");
    expect(el.textContent).toContain("zł"); // currency code kept
    expect(el.textContent).not.toMatch(/\d/);
  });

  it("shared provider: clicking ONE reveals ALL", () => {
    render(
      <SlotRevealProvider>
        <SlotAmount value="$10" />
        <SlotAmount value="$20" />
      </SlotRevealProvider>,
    );
    const [a, b] = screen.getAllByTestId("slot-amount");
    expect(a!.dataset.revealed).toBe("false");
    expect(b!.dataset.revealed).toBe("false");
    clickAndSettle(a!); // tap the FIRST
    expect(a!.dataset.revealed).toBe("true");
    expect(b!.dataset.revealed).toBe("true"); // the SECOND revealed too
    expect(a!.textContent).toBe("$10");
    expect(b!.textContent).toBe("$20");
  });
});
