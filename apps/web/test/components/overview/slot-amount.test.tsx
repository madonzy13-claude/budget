import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, fireEvent } from "@testing-library/react";
import { SlotAmount } from "@/components/budgeting/overview/slot-amount";

describe("SlotAmount", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it("starts hidden: real digits absent, uppercase random mask, currency + separators kept", () => {
    render(<SlotAmount value="$1,234" />);
    const el = screen.getByTestId("slot-amount");
    expect(el.dataset.revealed).toBe("false");
    expect(el.textContent).not.toMatch(/\d/); // real digits NOT in the DOM
    expect(el.textContent).toContain("$"); // currency not scrambled
    expect(el.textContent).toContain(","); // separator kept
    expect(el.textContent).not.toMatch(/[a-z]/); // uppercase only
    expect(el.textContent).toMatch(/[A-Z]/); // random uppercase chars present
  });

  it("reveals the real value on click, re-hides on a second click", () => {
    render(<SlotAmount value="$1,234" />);
    const el = screen.getByTestId("slot-amount");
    act(() => {
      fireEvent.click(el);
      vi.runAllTimers();
    });
    expect(el.dataset.revealed).toBe("true");
    expect(el.textContent).toBe("$1,234");
    act(() => {
      fireEvent.click(el);
      vi.runAllTimers();
    });
    expect(el.dataset.revealed).toBe("false");
    expect(el.textContent).not.toMatch(/\d/);
    expect(el.textContent).toContain("$");
  });

  it("Enter / Space toggle the reveal", () => {
    render(<SlotAmount value="42" />);
    const el = screen.getByTestId("slot-amount");
    act(() => {
      fireEvent.keyDown(el, { key: "Enter" });
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
});
