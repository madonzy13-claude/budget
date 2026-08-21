/**
 * use-viewport-fill-height.test.tsx — sizing the Overview's scroll box.
 *
 * The box fills from its own top to the bottom of the SMALL viewport. Only the
 * top is measured; the viewport half is a CSS unit, so the browser resolves it
 * and no script can hand it a stale or borrowed number. That division of labour
 * is what these tests protect — two black-band sagas came from measuring the
 * viewport in JS (page zoom, 260802; another app's keyboard, 260805 + 260821).
 *
 * The measured half still has to be right: `top` is written as a px length the
 * ELEMENT carries, so it is taken unscrolled and divided by the page zoom.
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

/**
 * The LAYOUT viewport — the frame the box is laid out in, and the one the iOS
 * keyboard never touches. This is what the box sizes to.
 */
const withLayoutViewport = (height: number) => {
  const original = Object.getOwnPropertyDescriptor(
    Object.getPrototypeOf(document.documentElement),
    "clientHeight",
  );
  Object.defineProperty(document.documentElement, "clientHeight", {
    configurable: true,
    value: height,
  });
  return () => {
    delete (document.documentElement as unknown as Record<string, unknown>)
      .clientHeight;
    if (original)
      Object.defineProperty(
        Object.getPrototypeOf(document.documentElement),
        "clientHeight",
        original,
      );
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

/** What the hook writes: the measured height, in the element's own pixels. */
const filled = (px: number) => `max(160px, ${px}px)`;

afterEach(() => {
  document.body.innerHTML = "";
  vi.restoreAllMocks();
});

describe("useViewportFillHeight (fitVisible)", () => {
  it("fills from its own top to the bottom of the layout viewport", () => {
    const el = zoomedEl({ zoom: 1, localTop: 114, localWidth: 1280 });
    const layout = withLayoutViewport(900);
    const pointer = withPointer(false);
    renderHook(() => {
      const ref = useRef(el);
      useViewportFillHeight(ref, { fitVisible: true });
    });
    expect(sizeOf(el)).toBe(filled(786));
    pointer();
    layout();
  });

  it("writes the height in the element's OWN pixels when the page is zoomed", () => {
    // At 1.5× the box renders 1.5× whatever it is told, and a rect reads 1.5×
    // its own box — so the screen-space 730px came out 1095px in a 900px
    // viewport, leaving 450px of black document below the shell (user, 260802).
    const el = zoomedEl({ zoom: 1.5, localTop: 114, localWidth: 1280 });
    const layout = withLayoutViewport(900);
    const pointer = withPointer(false);
    renderHook(() => {
      const ref = useRef(el);
      useViewportFillHeight(ref, { fitVisible: true });
    });
    // 900/1.5 − 114 = 486 local px → 729 on screen; 171 + 729 = 900, exactly
    // the viewport, with nothing left over to scroll.
    expect(sizeOf(el)).toBe(filled(486));
    pointer();
    layout();
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
    const layout = withLayoutViewport(900);
    const pointer = withPointer(false);
    renderHook(() => {
      const ref = useRef(el);
      useViewportFillHeight(ref, { fitVisible: true });
    });
    expect(sizeOf(el)).toBe(filled(786));
    pointer();
    layout();
  });

  it("is not moved by a pinch-zoomed visual viewport", () => {
    // Real numbers from the user's console at the zoom level that showed the
    // band: layout viewport 1759x516, visual viewport 1102.67x323.47 — a page
    // scale of 1.595. The box lives in LAYOUT pixels; sizing it to the visible
    // 323 left 193px of bare canvas under it (260802). Reading the layout
    // viewport directly puts a pinch out of reach — there is no scale to undo.
    const el = zoomedEl({ zoom: 1, localTop: 114, localWidth: 1759 });
    const layout = withLayoutViewport(516);
    const restore = withViewport(323.4664306640625, 1.595);
    const pointer = withPointer(false);
    renderHook(() => {
      const ref = useRef(el);
      useViewportFillHeight(ref, { fitVisible: true });
    });
    expect(sizeOf(el)).toBe(filled(402));
    pointer();
    restore();
    layout();
  });

  // Leave the app with another one's keyboard up and come back, and iOS hands
  // the PWA a visualViewport still short by the keyboard — a reading taken for
  // a window we were not even looking at. Sizing the box to it left a black
  // band of bare canvas where the keyboard had been (user report, 260805).
  it("ignores a viewport measured while the app was in the background", () => {
    const el = zoomedEl({ zoom: 1, localTop: 114, localWidth: 390 });
    const layout = withLayoutViewport(900);
    const vv = liveViewport(900);
    const pointer = withPointer(true);
    renderHook(() => {
      const ref = useRef(el);
      useViewportFillHeight(ref, { fitVisible: true });
    });
    expect(sizeOf(el)).toBe(filled(786));

    setVisibility("hidden");
    vv.setHeight(500); // the other app's keyboard, reserved
    vv.fireResize();
    expect(sizeOf(el)).toBe(filled(786));

    setVisibility("visible");
    pointer();
    vv.restore();
    layout();
  });

  // The band that would not go away (user, 260821). Switch to another app with
  // its keyboard up, come back, and iOS keeps reporting a viewport short by that
  // keyboard — not for the few hundred ms the settling window assumed, but until
  // the app is killed. A settling window cannot win that race: whatever it does
  // when the window closes, it acts on a reading that is still a lie, and the
  // short box then stays because nothing else ever resizes.
  //
  // So the box stops reading it. It fills to the LAYOUT viewport, which the
  // keyboard never touches, and the whole resume dance goes with it.
  it("keeps its size when the viewport is still short by another app's keyboard", () => {
    vi.useFakeTimers();
    const el = zoomedEl({ zoom: 1, localTop: 114, localWidth: 390 });
    const layout = withLayoutViewport(900);
    const vv = liveViewport(900);
    const pointer = withPointer(true);
    renderHook(() => {
      const ref = useRef(el);
      useViewportFillHeight(ref, { fitVisible: true });
    });
    const before = sizeOf(el);

    setVisibility("hidden");
    setVisibility("visible");
    vv.setHeight(500); // the other app's keyboard — and iOS keeps it
    vv.fireResize();
    vi.advanceTimersByTime(5000);
    vv.fireResize();

    expect(sizeOf(el)).toBe(before);
    expect(before).toBe(filled(786)); // …and the RIGHT size, not a frozen wrong one
    pointer();
    vv.restore();
    layout();
    vi.useRealTimers();
  });

  // The other direction, and the one that made the first fix wrong (user,
  // 260821): in the installed PWA the LAYOUT viewport comes back short of the
  // window — svh did the same — so a box sized off it alone left a permanent
  // strip of black under the last card on every view of the Overview, while
  // page-scrolled tabs reached the screen edge.
  //
  // Whichever of the two is TALLER is the one to fill, because the failures are
  // one-directional and opposite: a keyboard only ever SHRINKS the visual
  // viewport, so it can never win a max(); and only the visual viewport knows
  // about space the layout viewport is not being told about.
  it("fills the visual viewport when the layout one comes back short", () => {
    const el = zoomedEl({ zoom: 1, localTop: 114, localWidth: 390 });
    const layout = withLayoutViewport(806); // what the PWA reported
    const restore = withViewport(852); // …of a 852-tall window
    const pointer = withPointer(true);
    renderHook(() => {
      const ref = useRef(el);
      useViewportFillHeight(ref, { fitVisible: true });
    });
    expect(sizeOf(el)).toBe(filled(738));
    pointer();
    restore();
    layout();
  });

  it("sizes the same when there is no visualViewport at all", () => {
    // Nothing to fall back FROM any more — the box never reads it. This stands
    // guard: reintroduce a visualViewport read and it throws or diverges here.
    const el = zoomedEl({ zoom: 1, localTop: 100, localWidth: 1280 });
    const layout = withLayoutViewport(900);
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
    expect(sizeOf(el)).toBe(filled(800));
    pointer();
    restore();
    layout();
  });
});
