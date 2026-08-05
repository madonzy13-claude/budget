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

const withViewport = (height: number, scale = 1) => {
  const original = window.visualViewport;
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: { height, scale, addEventListener() {}, removeEventListener() {} },
  });
  return () =>
    Object.defineProperty(window, "visualViewport", {
      configurable: true,
      value: original,
    });
};

/**
 * A visualViewport whose height can be moved and whose listeners actually fire —
 * needed to replay what iOS does when the app comes back to the front.
 */
const liveViewport = (height: number) => {
  const listeners = new Map<string, Set<() => void>>();
  const vv = {
    height,
    scale: 1,
    addEventListener(type: string, fn: () => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: () => void) {
      listeners.get(type)?.delete(fn);
    },
  };
  const original = window.visualViewport;
  Object.defineProperty(window, "visualViewport", {
    configurable: true,
    value: vv,
  });
  return {
    setHeight(h: number) {
      vv.height = h;
    },
    fireResize() {
      listeners.get("resize")?.forEach((fn) => fn());
    },
    restore() {
      Object.defineProperty(window, "visualViewport", {
        configurable: true,
        value: original,
      });
    },
  };
};

/** Background or foreground the tab the way a real app switch does. */
const setVisibility = (state: "hidden" | "visible") => {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: state,
  });
  Object.defineProperty(document, "hidden", {
    configurable: true,
    value: state === "hidden",
  });
  document.dispatchEvent(new Event("visibilitychange"));
};

const sizeOf = (el: HTMLElement) => el.style.getPropertyValue("--grid-max-h");

/** What the hook writes: the 100svh floor, with the measured height over it. */
const filled = (top: number, px: number) =>
  `max(160px, calc(100svh - ${top}px), ${px}px)`;

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
    expect(sizeOf(el)).toBe(filled(114, 786));
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
    expect(sizeOf(el)).toBe(filled(114, 486));
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
    expect(sizeOf(el)).toBe(filled(114, 786));
    pointer();
    restore();
  });

  it("fills the LAYOUT viewport when the page is pinch-zoomed", () => {
    // Real numbers from the user's console at the zoom level that showed the
    // band: layout viewport 1759x516, visual viewport 1102.67x323.47 — a page
    // scale of 1.595. The box lives in LAYOUT pixels, so sizing it to the
    // visible 323 left 193px of bare canvas under it, more the further they
    // zoomed. Scale is 1 unless the page is pinched, so nothing else moves.
    const el = zoomedEl({ zoom: 1, localTop: 114, localWidth: 1759 });
    const restore = withViewport(323.4664306640625, 1.595);
    const pointer = withPointer(false);
    renderHook(() => {
      const ref = useRef(el);
      useViewportFillHeight(ref, { fitVisible: true });
    });
    expect(sizeOf(el)).toBe(filled(114, 402));
    pointer();
    restore();
  });

  // Leave the app with another one's keyboard up and come back, and iOS hands
  // the PWA a visualViewport still short by the keyboard — a reading taken for
  // a window we were not even looking at. Sizing the box to it left a black
  // band of bare canvas where the keyboard had been (user report, 260805).
  it("ignores a viewport measured while the app was in the background", () => {
    const el = zoomedEl({ zoom: 1, localTop: 114, localWidth: 390 });
    const vv = liveViewport(900);
    const pointer = withPointer(true);
    renderHook(() => {
      const ref = useRef(el);
      useViewportFillHeight(ref, { fitVisible: true });
    });
    expect(sizeOf(el)).toBe(filled(114, 786));

    setVisibility("hidden");
    vv.setHeight(500); // the other app's keyboard, reserved
    vv.fireResize();
    expect(sizeOf(el)).toBe(filled(114, 786));

    setVisibility("visible");
    pointer();
    vv.restore();
  });

  // Guarding the hidden reading alone still let the band FLASH: the shrunken
  // viewport is what iOS reports for the first few hundred ms AFTER the app is
  // visible again, so re-measuring on resume wrote a short box, showed the
  // band, and corrected it a moment later (user video, 260805).
  //
  // The answer is a FLOOR rather than a timing window. 100svh is the viewport
  // with every dynamic toolbar shown — the smallest the visible area can
  // legitimately be — so a reading still carrying the previous app's keyboard
  // falls under it and changes nothing. There is no window to get wrong and no
  // state to hold.
  it("keeps a floor under the box, so a stale viewport cannot shorten it", () => {
    const el = zoomedEl({ zoom: 1, localTop: 114, localWidth: 390 });
    const vv = liveViewport(900);
    const pointer = withPointer(true);
    renderHook(() => {
      const ref = useRef(el);
      useViewportFillHeight(ref, { fitVisible: true });
    });

    setVisibility("hidden");
    setVisibility("visible");
    // iOS is still holding the keyboard's space.
    vv.setHeight(500);
    vv.fireResize();

    // The short reading is written, but only ever as something that could ADD
    // height — the floor is what the box actually takes.
    expect(sizeOf(el)).toBe(filled(114, 386));
    pointer();
    vv.restore();
  });

  // Every write carries the floor, whatever the viewport is doing — that is the
  // whole guarantee, so it is worth asserting on its own.
  it("never writes a height without that floor under it", () => {
    const el = zoomedEl({ zoom: 1, localTop: 114, localWidth: 390 });
    const vv = liveViewport(900);
    const pointer = withPointer(true);
    renderHook(() => {
      const ref = useRef(el);
      useViewportFillHeight(ref, { fitVisible: true });
    });
    for (const h of [500, 900, 1000, 300]) {
      vv.setHeight(h);
      vv.fireResize();
      expect(sizeOf(el)).toContain("calc(100svh - 114px)");
    }
    pointer();
    vv.restore();
  });

  // A viewport that genuinely gained height — the iOS bar collapsing — is what
  // the measured value is FOR, and it still wins over the floor.
  it("takes a taller viewport straight away on resume", () => {
    const el = zoomedEl({ zoom: 1, localTop: 114, localWidth: 390 });
    const vv = liveViewport(900);
    const pointer = withPointer(true);
    renderHook(() => {
      const ref = useRef(el);
      useViewportFillHeight(ref, { fitVisible: true });
    });

    setVisibility("hidden");
    setVisibility("visible");
    vv.setHeight(1000);
    vv.fireResize();

    expect(sizeOf(el)).toBe(filled(114, 886));
    pointer();
    vv.restore();
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
    expect(sizeOf(el)).toBe(filled(100, window.innerHeight - 100));
    pointer();
    restore();
  });
});
