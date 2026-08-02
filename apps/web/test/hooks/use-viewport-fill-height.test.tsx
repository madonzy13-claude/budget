/**
 * use-viewport-fill-height.test.tsx — sizing the Overview's scroll box (260802).
 *
 * The hook writes a PIXEL height. Page zoom scales every px length the element
 * carries, while visualViewport keeps reporting screen pixels — so a box sized
 * "viewport minus my top" came out zoom× too tall and pushed a black band of
 * empty document below the shell (user report). The written value has to be in
 * the element's OWN space.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRef } from "react";
import { useViewportFillHeight } from "@/hooks/use-viewport-fill-height";

/**
 * An element whose rect is `zoom`× its own layout box, as a zoomed page has.
 * `scrolledBy` moves it UP the viewport the way a scrolled page does: the rect
 * reports less `top`, while the scroller carries the offset.
 */
function zoomedEl(opts: {
  zoom: number;
  localTop: number;
  localWidth: number;
  scrolledBy?: number;
}) {
  const el = document.createElement("div");
  const { zoom, localTop, localWidth } = opts;
  const scrolledBy = opts.scrolledBy ?? 0;
  Object.defineProperty(el, "offsetWidth", {
    configurable: true,
    value: localWidth,
  });
  const viewportTop = (localTop - scrolledBy) * zoom;
  el.getBoundingClientRect = () =>
    ({
      top: viewportTop,
      width: localWidth * zoom,
      height: 0,
      left: 0,
      right: localWidth * zoom,
      bottom: viewportTop,
      x: 0,
      y: viewportTop,
      toJSON: () => {},
    }) as DOMRect;
  const scroller = document.createElement("div");
  scroller.appendChild(el);
  document.body.appendChild(scroller);
  Object.defineProperty(scroller, "scrollTop", {
    configurable: true,
    value: scrolledBy * zoom,
  });
  return el;
}

/** A fine (desktop) pointer unless a test says otherwise. */
const withPointer = (coarse: boolean) => {
  const original = window.matchMedia;
  window.matchMedia = ((q: string) =>
    ({
      matches: q.includes("coarse") ? coarse : false,
      media: q,
      addEventListener() {},
      removeEventListener() {},
    }) as unknown as MediaQueryList) as typeof window.matchMedia;
  return () => {
    window.matchMedia = original;
  };
};

const withViewport = (height: number) => {
  const original = window.visualViewport;
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: { height, addEventListener() {}, removeEventListener() {} },
  });
  return () =>
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: original,
    });
};

const sizeOf = (el: HTMLElement) => el.style.getPropertyValue("--grid-max-h");

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("useViewportFillHeight (fitVisible)", () => {
  it("fills from its top to the bottom of an unzoomed viewport", () => {
    const el = zoomedEl({ zoom: 1, localTop: 114, localWidth: 1280 });
    const restore = withViewport(900);
    const pointer = withPointer(false);
    renderHook(() => {
      const ref = useRef(el);
      useViewportFillHeight(ref, { fitVisible: true });
    });
    expect(sizeOf(el)).toBe("max(160px, 786px)");
    pointer();
    restore();
  });

  it("writes the height in the element's OWN pixels when the page is zoomed", () => {
    // At 1.5× the box renders 1.5× whatever it is told, and a rect reads 1.5×
    // its own box — so the screen-space 730px came out 1095px in a 900px
    // viewport, leaving 450px of black document below the shell.
    const el = zoomedEl({ zoom: 1.5, localTop: 114, localWidth: 1280 });
    const restore = withViewport(900);
    const pointer = withPointer(false);
    renderHook(() => {
      const ref = useRef(el);
      useViewportFillHeight(ref, { fitVisible: true });
    });
    // 900/1.5 − 114 = 486 local px → 729 on screen; 171 + 729 = 900, exactly
    // the viewport, with nothing left over to scroll.
    expect(sizeOf(el)).toBe("max(160px, 486px)");
    pointer();
    restore();
  });

  it("keeps its size when the page under it is scrolled", () => {
    // A rect's `top` is viewport-relative: scroll the page and it shrinks, so a
    // box sized "viewport minus my top" GREW, which made the document taller,
    // which allowed more scroll — a runaway that left a black band of bare
    // document under the shell, worse the further you zoomed (user report,
    // 260802). The box has to size off its UNSCROLLED position.
    const el = zoomedEl({
      zoom: 1,
      localTop: 114,
      localWidth: 1280,
      scrolledBy: 114,
    });
    const restore = withViewport(900);
    const pointer = withPointer(false);
    renderHook(() => {
      const ref = useRef(el);
      useViewportFillHeight(ref, { fitVisible: true });
    });
    expect(sizeOf(el)).toBe("max(160px, 786px)");
    pointer();
    restore();
  });

  it("falls back to the window when there is no visualViewport", () => {
    const el = zoomedEl({ zoom: 1, localTop: 100, localWidth: 1280 });
    const restore = withViewport(0);
    const pointer = withPointer(true);
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: undefined,
    });
    renderHook(() => {
      const ref = useRef(el);
      useViewportFillHeight(ref, { fitVisible: true });
    });
    // innerHeight is the same screen space, so the box still lands right.
    expect(sizeOf(el)).toBe(`max(160px, ${window.innerHeight - 100}px)`);
    pointer();
    restore();
  });
});
