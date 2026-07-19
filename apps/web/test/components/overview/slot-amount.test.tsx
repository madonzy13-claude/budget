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

  const charSpans = (el: HTMLElement) =>
    Array.from(el.querySelectorAll("span"));
  const blurredChars = (el: HTMLElement) =>
    charSpans(el).filter((s) => s.style.filter.includes("blur"));

  it("starts hidden: EVERY non-space char (digits, separators, sign, currency) scrambled to uppercase + blurred", () => {
    render(<SlotAmount value="$1,234" />);
    const el = screen.getByTestId("slot-amount");
    expect(el.dataset.revealed).toBe("false");
    expect(el.textContent).not.toMatch(/\d/); // real digits NOT in the DOM
    expect(el.textContent).not.toContain(","); // separator hidden (magnitude)
    expect(el.textContent).toContain("$"); // currency STAYS visible
    expect(el.textContent).not.toMatch(/[a-z]/); // uppercase only
    expect(el.textContent).toMatch(/[A-Z]/); // random uppercase chars present
    // The 5 number chars of "$1,234" (1 , 2 3 4) are masked; "$" is not.
    expect(blurredChars(el).length).toBe(5);
    expect(blurredChars(el)[0]!.style.filter).toContain("em");
  });

  it("masks with ONLY the allowed glyphs — comma / dot / '1' → 'I', others from the set", () => {
    render(<SlotAmount value="$1,204.10" />);
    const el = screen.getByTestId("slot-amount");
    const allowed = new Set(("I" + "ERTYUPASDFHJKLZXVN").split(""));
    blurredChars(el).forEach((s) =>
      expect(allowed.has(s.textContent!)).toBe(true),
    );
    // "$ 1 , 2 0 4 . 1 0" → the narrow glyphs (1, comma, dot) always render "I".
    const spans = charSpans(el);
    expect(spans[1]!.textContent).toBe("I"); // "1"
    expect(spans[2]!.textContent).toBe("I"); // ","
    expect(spans[6]!.textContent).toBe("I"); // "."
    expect(spans[7]!.textContent).toBe("I"); // "1"
  });

  it("hides the sign but keeps the currency + space verbatim", () => {
    render(<SlotAmount value="-50 zł" />);
    const el = screen.getByTestId("slot-amount");
    expect(el.textContent).not.toContain("-"); // sign hidden
    expect(el.textContent).toContain("zł"); // currency STAYS visible
    expect(el.textContent).toContain(" "); // the single space is preserved
    expect(el.textContent).not.toMatch(/\d/);
    expect(blurredChars(el).length).toBe(3); // "-","5","0" — currency + space excluded
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
    expect(blurredChars(el).length).toBeGreaterThan(0); // masked again
  });

  it("Enter toggles the reveal", () => {
    render(<SlotAmount value="42" />);
    const el = screen.getByTestId("slot-amount");
    act(() => fireEvent.keyDown(el, { key: "Enter" }));
    act(() => vi.runAllTimers());
    expect(el.textContent).toBe("42");
  });

  it("updates the SHOWN amount when the value changes while REVEALED (pie-slice click)", () => {
    // Regression: clicking pie slices swaps the centre value in place; a revealed
    // SlotAmount used to keep showing the OLD value (only the mask refreshed).
    const { rerender } = render(<SlotAmount value="$10" />);
    const el = screen.getByTestId("slot-amount");
    clickAndSettle(el); // reveal
    expect(el.textContent).toBe("$10");
    rerender(<SlotAmount value="$20" />); // value changes while still revealed
    act(() => vi.runAllTimers());
    expect(el.textContent).toBe("$20"); // NOT the stale "$10"
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
