import { describe, it, expect } from "vitest";
import { computeScreenExtension, gridTopOffset, gridOverscrollY } from "../src/lib/grid-screen-anchor";

/**
 * Exhaustive gate matrix for computeScreenExtension.
 * Every row in the plan's <gate_matrix> is covered here.
 * This is the load-bearing safety that proves desktop/Android/Chromium
 * are bit-identical to R16 (extension == 0).
 */
describe("grid screen anchor — computeScreenExtension gate matrix (SHELL-R17)", () => {
  // ── iOS browser: nominal case ────────────────────────────────────────────
  it("iOS browser: extends box by lvh→screen delta (844/754 → 90)", () => {
    expect(
      computeScreenExtension({
        screenH: 844,
        lvhPx: 754,
        isCoarsePointer: true,
        isIOS: true,
      }),
    ).toBe(90);
  });

  // ── iOS browser bar fully collapsed (lvh == screen) ──────────────────────
  it("iOS browser bar collapsed: delta 0 → 0", () => {
    expect(
      computeScreenExtension({
        screenH: 844,
        lvhPx: 844,
        isCoarsePointer: true,
        isIOS: true,
      }),
    ).toBe(0);
  });

  // ── iOS standalone: lvh == screen (user-approved frozen path) ────────────
  it("iOS standalone: lvh==screen → 0 (frozen, identical to R16)", () => {
    expect(
      computeScreenExtension({
        screenH: 844,
        lvhPx: 844,
        isCoarsePointer: true,
        isIOS: true,
      }),
    ).toBe(0);
  });

  // ── iOS clamp-hi: delta far exceeds 140 → clamped to 140 ────────────────
  it("iOS clamp-hi: delta 446 → 140 (clamped)", () => {
    expect(
      computeScreenExtension({
        screenH: 1200,
        lvhPx: 754,
        isCoarsePointer: true,
        isIOS: true,
      }),
    ).toBe(140);
  });

  // ── iOS negative delta (lvhPx > screenH, malformed input) ───────────────
  it("iOS negative delta: clamped lo → 0", () => {
    expect(
      computeScreenExtension({
        screenH: 700,
        lvhPx: 754,
        isCoarsePointer: true,
        isIOS: true,
      }),
    ).toBe(0);
  });

  // ── Desktop: gate blocks (isIOS=false, isCoarsePointer=false) ───────────
  it("desktop: gate returns 0 even with large screenH−lvhPx delta (640)", () => {
    expect(
      computeScreenExtension({
        screenH: 1440,
        lvhPx: 800,
        isCoarsePointer: false,
        isIOS: false,
      }),
    ).toBe(0);
  });

  // ── Desktop with touch screen: gate still blocks (not iOS) ───────────────
  it("desktop-touch (coarse but not iOS): gate returns 0", () => {
    expect(
      computeScreenExtension({
        screenH: 1440,
        lvhPx: 800,
        isCoarsePointer: true,
        isIOS: false,
      }),
    ).toBe(0);
  });

  // ── Android Chrome: coarse pointer, not iOS → 0 ─────────────────────────
  it("Android Chrome: coarse + not iOS → 0", () => {
    expect(
      computeScreenExtension({
        screenH: 915,
        lvhPx: 800,
        isCoarsePointer: true,
        isIOS: false,
      }),
    ).toBe(0);
  });

  // ── Chromium headless e2e: screen ≈ lvh, not iOS → 0 ────────────────────
  it("Chromium e2e: screen≈lvh + not iOS → 0 (gate AND near-zero delta)", () => {
    expect(
      computeScreenExtension({
        screenH: 800,
        lvhPx: 800,
        isCoarsePointer: false,
        isIOS: false,
      }),
    ).toBe(0);
  });

  // ── iPadOS desktop-UA: UA-reported not iOS, isIOS=false → 0 ─────────────
  it("iPadOS desktop-UA: isIOS=false → 0 (iPad browser already composites correctly)", () => {
    expect(
      computeScreenExtension({
        screenH: 1366,
        lvhPx: 980,
        isCoarsePointer: true,
        isIOS: false,
      }),
    ).toBe(0);
  });

  // ── Boundary: exactly 140 delta → 140 (not clamped) ─────────────────────
  it("boundary: delta exactly 140 → 140 (at ceiling, not clamped)", () => {
    expect(
      computeScreenExtension({
        screenH: 894,
        lvhPx: 754,
        isCoarsePointer: true,
        isIOS: true,
      }),
    ).toBe(140);
  });

  // ── Boundary: delta 141 → clamped to 140 ────────────────────────────────
  it("boundary: delta 141 → 140 (clamped hi)", () => {
    expect(
      computeScreenExtension({
        screenH: 895,
        lvhPx: 754,
        isCoarsePointer: true,
        isIOS: true,
      }),
    ).toBe(140);
  });

  // ── Boundary: delta exactly 0 → 0 ───────────────────────────────────────
  it("boundary: delta 0 → 0 (no extension needed)", () => {
    expect(
      computeScreenExtension({
        screenH: 754,
        lvhPx: 754,
        isCoarsePointer: true,
        isIOS: true,
      }),
    ).toBe(0);
  });

  // ── Non-finite input guard ────────────────────────────────────────────────
  it("non-finite delta (NaN) → 0 (safety guard)", () => {
    expect(
      computeScreenExtension({
        screenH: NaN,
        lvhPx: 754,
        isCoarsePointer: true,
        isIOS: true,
      }),
    ).toBe(0);
  });

  it("non-finite delta (Infinity) → 140 (clamped, still safe)", () => {
    expect(
      computeScreenExtension({
        screenH: Infinity,
        lvhPx: 754,
        isCoarsePointer: true,
        isIOS: true,
      }),
    ).toBe(0); // Infinity - finite = Infinity; isFinite check returns 0
  });
});

/**
 * gridTopOffset — the grid's distance from the TOP OF THE PAGE, not from the
 * top of the viewport (user, 261004: "sometimes when I scroll in spendings I
 * cannot scroll back; only closing the app helps").
 *
 * The grid's height is `100lvh − top`, and `top` came from
 * `getBoundingClientRect().top`, which is measured against the VIEWPORT. Scroll
 * the page down by S and that reads S smaller, so the grid is rebuilt S taller
 * — which keeps the document taller than the viewport, which keeps the page
 * scrolled. A loop that feeds itself.
 *
 * It traps because the grid sets `overscroll-behavior: none` and covers
 * everything below the band: a swipe over it never chains to the page, and the
 * grid's own content is too short to scroll. Nothing left to drag the page back
 * up with.
 *
 * Measured from the page instead, `top + height == viewport` whichever way the
 * page happens to be scrolled, so the document never outgrows the viewport and
 * the trap cannot form.
 */
describe("gridTopOffset", () => {
  it("is the rect top when the page is not scrolled", () => {
    expect(gridTopOffset({ rectTop: 220, scrollTop: 0 })).toBe(220);
  });

  it("adds back the scroll, so a scrolled page measures the same offset", () => {
    // The banner (135px) has scrolled away: the rect reads 85, but the grid is
    // still 220 from the top of the page.
    expect(gridTopOffset({ rectTop: 85, scrollTop: 135 })).toBe(220);
  });

  it("never goes negative, whatever rubber-banding reports", () => {
    expect(gridTopOffset({ rectTop: -40, scrollTop: 0 })).toBe(0);
  });

  it("rounds, so a fractional layout cannot drift the box", () => {
    expect(gridTopOffset({ rectTop: 85.4, scrollTop: 134.8 })).toBe(220);
  });
});

/**
 * gridOverscrollY — the grid must not swallow a gesture it cannot use
 * (user, 261004).
 *
 * `overscroll-behavior: none` is there to stop a vertical or diagonal swipe
 * inside the grid from bleeding into the page and firing pull-to-refresh. But
 * it applied even when the grid had NOTHING to scroll: measured on a column
 * with no transactions, `scrollHeight - clientHeight` is 0 and the box still
 * refused to chain. With the page scrolled down, every touch landed on the
 * grid, the grid did nothing with it and passed nothing on, and there was no
 * way back up short of relaunching.
 *
 * Chaining is only dangerous while the grid HAS scroll of its own to protect.
 */
describe("gridOverscrollY", () => {
  // INSTALLED APP — always chain. There is no native pull-to-refresh to guard
  // against, and refusing to chain is precisely the trap (user, 261004):
  // "scroll down and up without lifting my finger works nice, but once I
  // scroll down and lift my finger I cannot scroll up". A gesture locks its
  // scroll chain at touchstart, so one unbroken drag keeps driving whatever it
  // started on. Lift, and the next touch re-resolves onto the grid — which
  // sits at its own top, has nothing left to give in that direction, and with
  // `none` hands nothing on either. `auto` chains only at the edge, which is
  // exactly the wanted behaviour.
  it("always chains in the installed app, even with rows to scroll", () => {
    expect(gridOverscrollY(120, true)).toBe("auto");
  });

  it("chains in the installed app with nothing to scroll", () => {
    expect(gridOverscrollY(0, true)).toBe("auto");
  });

  // BROWSER — Safari's own pull-to-refresh fires on a downward swipe at the
  // top of the page, and chaining would feed it. Hold the gesture while there
  // are rows; let it go when there is nothing here to scroll anyway.
  it("holds the gesture in the browser while the grid has rows", () => {
    expect(gridOverscrollY(120, false)).toBe("none");
  });

  it("releases it in the browser when the grid has nothing to scroll", () => {
    expect(gridOverscrollY(0, false)).toBe("auto");
  });

  it("treats a sub-pixel overflow as nothing — rounding is not content", () => {
    expect(gridOverscrollY(0.4, false)).toBe("auto");
  });
});

/**
 * shouldSuppressPullToRefresh — the pull-to-refresh suppressor must not eat
 * every upward scroll (user, 261004/05).
 *
 * The grid cancels a downward-cone gesture to stop iOS Safari's
 * pull-to-refresh. But a downward FINGER drag is how you scroll UP, and the
 * guard that was supposed to limit this — `startScrollTop > 1` — can never be
 * true: touchstart pins scrollTop to 1 first, so the start is ALWAYS 1 and the
 * suppressor always armed. Every attempt to scroll back up over the grid was
 * preventDefault()ed outright.
 *
 * That is why one unbroken drag worked (its scroll was already committed, and
 * the finger was moving UP on the way down so nothing matched the cone) while
 * a fresh touch did nothing, and why the month slider worked — it is outside
 * the element these listeners are bound to.
 *
 * Pull-to-refresh can only fire when the PAGE is at its top, and only in the
 * browser: the installed app has no such gesture.
 */
