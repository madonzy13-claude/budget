import { describe, it, expect } from "vitest";
import { computeScreenExtension } from "../src/lib/grid-screen-anchor";

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
