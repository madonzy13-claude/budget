/**
 * scroll-to-draft drives each scroll ancestor itself.
 *
 * The obvious implementation — one `scrollIntoView({behavior:"smooth"})` — was
 * reported as "the first tap moves it about a pixel, the second works". A
 * smooth scrollIntoView is a single animation across the whole ancestor chain,
 * and WebKit animates only the nearest ancestor when there is more than one;
 * the installed PWA has more than one, because the spendings grid becomes its
 * own scroller in standalone. Anything else that scrolls mid-flight cancels it
 * too.
 *
 * So the contract under test is: every scrollable ancestor is scrolled, each
 * one smoothly, to a position computed BEFORE any of them moves.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { scrollToDraft } from "@/lib/scroll-to-draft";

/** A scroller with known geometry. happy-dom reports zeros for layout, so
 *  every measurement the helper reads is stubbed explicitly. */
function makeScroller(opts: {
  rect: { top: number; left: number; width: number; height: number };
  scrollLeft?: number;
  scrollTop?: number;
  scrollWidth?: number;
  scrollHeight?: number;
  overflow?: string;
}) {
  const el = document.createElement("div");
  const {
    rect,
    scrollLeft = 0,
    scrollTop = 0,
    scrollWidth = 4000,
    scrollHeight = 400,
    overflow = "auto",
  } = opts;
  Object.defineProperties(el, {
    clientWidth: { value: rect.width, configurable: true },
    clientHeight: { value: rect.height, configurable: true },
    scrollWidth: { value: scrollWidth, configurable: true },
    scrollHeight: { value: scrollHeight, configurable: true },
    scrollLeft: { value: scrollLeft, writable: true, configurable: true },
    scrollTop: { value: scrollTop, writable: true, configurable: true },
  });
  el.getBoundingClientRect = () =>
    ({
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
      right: rect.left + rect.width,
      bottom: rect.top + rect.height,
    }) as DOMRect;
  el.style.overflow = overflow;
  el.scrollTo = vi.fn();
  return el;
}

function makeTarget(rect: { top: number; left: number }) {
  const el = document.createElement("div");
  el.setAttribute("data-draft-id", "d1");
  el.getBoundingClientRect = () =>
    ({
      top: rect.top,
      left: rect.left,
      width: 100,
      height: 40,
      right: rect.left + 100,
      bottom: rect.top + 40,
    }) as DOMRect;
  return el;
}

beforeEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  window.scrollTo = vi.fn();
  Object.defineProperty(window, "innerHeight", {
    value: 800,
    configurable: true,
  });
  Object.defineProperty(window, "innerWidth", {
    value: 400,
    configurable: true,
  });
});

describe("scrollToDraft", () => {
  it("scrolls the horizontal ancestor so the row is centred", () => {
    // Grid is 400 wide starting at x=0; the row sits at x=1500 and is 100 wide.
    // Centring wants the row's left edge at (400-100)/2 = 150 inside the grid,
    // so scrollLeft moves by 1500 - 0 - 150 = 1350.
    const grid = makeScroller({
      rect: { top: 100, left: 0, width: 400, height: 600 },
    });
    const row = makeTarget({ top: 300, left: 1500 });
    grid.appendChild(row);
    document.body.appendChild(grid);

    expect(scrollToDraft("d1")).toBe(true);
    expect(grid.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ left: 1350, behavior: "smooth" }),
    );
  });

  it("scrolls EVERY scrollable ancestor, not just the nearest", () => {
    // The regression this whole file exists for. Outer shell scroller (the
    // standalone PWA's) + the grid inside it.
    const shell = makeScroller({
      rect: { top: 0, left: 0, width: 400, height: 700 },
      scrollHeight: 3000,
      scrollWidth: 400,
    });
    const grid = makeScroller({
      rect: { top: 100, left: 0, width: 400, height: 300 },
    });
    const row = makeTarget({ top: 900, left: 1500 });
    grid.appendChild(row);
    shell.appendChild(grid);
    document.body.appendChild(shell);

    scrollToDraft("d1");
    expect(grid.scrollTo).toHaveBeenCalled();
    expect(shell.scrollTo).toHaveBeenCalled();
  });

  it("leaves a scroller alone when the row is already within it", () => {
    // block:"nearest" semantics — do not drag the page around for nothing.
    const grid = makeScroller({
      rect: { top: 100, left: 0, width: 400, height: 600 },
      scrollWidth: 400,
      scrollHeight: 600,
      overflow: "visible",
    });
    const row = makeTarget({ top: 300, left: 20 });
    grid.appendChild(row);
    document.body.appendChild(grid);

    scrollToDraft("d1");
    expect(grid.scrollTo).not.toHaveBeenCalled();
  });

  it("never asks for a negative offset", () => {
    // A row near the start centres to a negative scrollLeft on paper; clamping
    // is what keeps the call meaningful rather than silently ignored.
    const grid = makeScroller({
      rect: { top: 100, left: 0, width: 400, height: 600 },
    });
    const row = makeTarget({ top: 300, left: 10 });
    grid.appendChild(row);
    document.body.appendChild(grid);

    scrollToDraft("d1");
    const call = (grid.scrollTo as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(call.left).toBeGreaterThanOrEqual(0);
  });

  it("flashes the row and clears the flag afterwards", () => {
    vi.useFakeTimers();
    const grid = makeScroller({
      rect: { top: 100, left: 0, width: 400, height: 600 },
    });
    const row = makeTarget({ top: 300, left: 1500 });
    grid.appendChild(row);
    document.body.appendChild(grid);

    scrollToDraft("d1");
    expect(row.getAttribute("data-draft-flash")).toBe("");
    vi.advanceTimersByTime(3000);
    expect(row.hasAttribute("data-draft-flash")).toBe(false);
    vi.useRealTimers();
  });

  it("reports false when the row is not on the page", () => {
    expect(scrollToDraft("nope")).toBe(false);
  });

  it("skips the animation when the user asked for reduced motion", () => {
    // Motion here is decoration; the flash still says where it landed.
    window.matchMedia = vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }) as unknown as typeof window.matchMedia;
    const grid = makeScroller({
      rect: { top: 100, left: 0, width: 400, height: 600 },
    });
    const row = makeTarget({ top: 300, left: 1500 });
    grid.appendChild(row);
    document.body.appendChild(grid);

    scrollToDraft("d1");
    expect(grid.scrollTo).toHaveBeenCalledWith(
      expect.objectContaining({ behavior: "auto" }),
    );
  });
});
