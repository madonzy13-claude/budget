/**
 * pull-to-refresh-header-only.test.tsx
 *
 * PTR must engage ONLY when the pull STARTS on the header ([data-shell-header]).
 * A pull that starts below the header (in page content) must NOT trigger the
 * refresh gesture — it scrolls/does nothing. (User request 2026-06-19.)
 *
 * The listener stays on [data-ptr-blur-target] (which wraps header + main) so
 * iOS header touches still register; the header-only restriction is a guard in
 * onTouchStart.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { PullToRefresh } from "../../src/components/common/pull-to-refresh";

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

let wrapper: HTMLElement;
let header: HTMLElement;
let main: HTMLElement;
let content: HTMLElement;

function fakeStandalone() {
  vi.stubGlobal("matchMedia", (q: string) => ({
    matches: q.includes("standalone"),
    media: q,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    onchange: null,
    dispatchEvent() {
      return false;
    },
  }));
}

// Build the shell DOM the component queries on mount.
function mountShell() {
  wrapper = document.createElement("div");
  wrapper.setAttribute("data-ptr-blur-target", "");
  header = document.createElement("header");
  header.setAttribute("data-shell-header", "");
  main = document.createElement("main");
  content = document.createElement("div");
  content.textContent = "page content";
  main.appendChild(content);
  wrapper.append(header, main);
  document.body.appendChild(wrapper);
}

function touch(type: string, clientY: number) {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, "touches", {
    configurable: true,
    value: [{ clientY }],
  });
  return e;
}

function indicatorHidden(): boolean {
  const el = document.querySelector(
    '[data-testid="pull-to-refresh-indicator"]',
  );
  return el?.getAttribute("aria-hidden") === "true";
}

beforeEach(() => {
  fakeStandalone();
  mountShell();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("PullToRefresh — header-only engagement", () => {
  it("engages when the pull STARTS on the header", () => {
    render(<PullToRefresh />);
    // start on header, then pull down well past threshold
    act(() => {
      header.dispatchEvent(touch("touchstart", 10));
      wrapper.dispatchEvent(touch("touchmove", 210)); // +200 → damped 100 > threshold
    });
    expect(indicatorHidden()).toBe(false); // indicator visible → engaged
  });

  it("does NOT engage when the pull STARTS below the header (page content)", () => {
    render(<PullToRefresh />);
    act(() => {
      content.dispatchEvent(touch("touchstart", 300));
      wrapper.dispatchEvent(touch("touchmove", 500)); // +200 pull attempt
    });
    expect(indicatorHidden()).toBe(true); // never engaged
  });
});
