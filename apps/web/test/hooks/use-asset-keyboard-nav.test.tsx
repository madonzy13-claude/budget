/**
 * use-asset-keyboard-nav.test.tsx — which key opens the inline amount editor
 * on the assets pill (user, 260930).
 *
 * Space, not Enter — the same change the spendings grid took in the same
 * breath, so one key does one job across both tabs. Enter was overloaded:
 * it opened the editor here and committed it there.
 *
 * Only the ROW-FIELD activation moves. Enter still toggles an investment
 * group, opens an investment row, and presses an "add" button — those are
 * buttons, and Enter is what a button answers to. Space now works on them too,
 * which is what a button answers to as well (and stops the page scrolling).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, fireEvent, act } from "@testing-library/react";
import { useRef } from "react";
import { useAssetKeyboardNav } from "../../src/hooks/use-asset-keyboard-nav";

/** Desktop — the hook is a no-op below md. */
function setWide() {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: (query: string) => ({
      matches: query.includes("768px"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}

const amountClick = vi.fn();
const toggleClick = vi.fn();

function Harness() {
  const ref = useRef<HTMLDivElement | null>(null);
  useAssetKeyboardNav(ref);
  return (
    <div ref={ref}>
      <div data-nav-item data-nav-type="wallet" id="w1">
        <div data-nav-field="name" />
        <div data-nav-field="amount">
          <span role="button" onClick={amountClick}>
            100
          </span>
        </div>
      </div>
      <div data-nav-item data-nav-type="invest-group" id="g1">
        <span data-nav-toggle onClick={toggleClick} />
      </div>
    </div>
  );
}

function key(k: string) {
  act(() => {
    fireEvent.keyDown(document, { key: k });
  });
}

describe("assets pill — the key that opens the amount editor", () => {
  beforeEach(() => {
    setWide();
    amountClick.mockClear();
    toggleClick.mockClear();
  });
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("opens the amount editor on Space", () => {
    render(<Harness />);
    key("ArrowDown"); // highlight the wallet row
    key(" ");
    expect(amountClick).toHaveBeenCalled();
  });

  it("no longer opens it on Enter", () => {
    render(<Harness />);
    key("ArrowDown");
    key("Enter");
    expect(amountClick).not.toHaveBeenCalled();
  });

  it("still lets Enter work the controls that are buttons", () => {
    render(<Harness />);
    key("ArrowDown");
    key("ArrowDown"); // on to the investment group header
    key("Enter");
    expect(toggleClick).toHaveBeenCalled();
  });

  it("and lets Space work them too", () => {
    render(<Harness />);
    key("ArrowDown");
    key("ArrowDown");
    key(" ");
    expect(toggleClick).toHaveBeenCalled();
  });
});
