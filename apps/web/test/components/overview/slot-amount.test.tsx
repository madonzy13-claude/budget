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

  it("starts hidden: real digits absent, uppercase random mask, currency + separators kept, blurred", () => {
    render(<SlotAmount value="$1,234" />);
    const el = screen.getByTestId("slot-amount");
    expect(el.dataset.revealed).toBe("false");
    expect(el.textContent).not.toMatch(/\d/); // real digits NOT in the DOM
    expect(el.textContent).toContain("$"); // currency not scrambled
    expect(el.textContent).toContain(","); // separator kept
    expect(el.textContent).not.toMatch(/[a-z]/); // uppercase only
    expect(el.textContent).toMatch(/[A-Z]/); // random uppercase chars present
    expect(el.style.filter).toContain("blur"); // slightly blurred while hidden
  });

  it("reveals the real value on click (sharp, no blur), re-hides on a second click", () => {
    render(<SlotAmount value="$1,234" />);
    const el = screen.getByTestId("slot-amount");
    clickAndSettle(el);
    expect(el.dataset.revealed).toBe("true");
    expect(el.textContent).toBe("$1,234");
    expect(el.style.filter).toBe("none"); // sharp when revealed
    clickAndSettle(el);
    expect(el.dataset.revealed).toBe("false");
    expect(el.textContent).not.toMatch(/\d/);
    expect(el.style.filter).toContain("blur");
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
