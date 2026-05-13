/**
 * reveal-actions.test.tsx — Vitest+RTL tests for useRevealActions hook.
 *
 * Critical: D-PH4-INT1 regression-guard — pointermove WITHOUT click must NOT
 * set revealed=true. T-04-03-05: any onMouseEnter/hover that reveals actions
 * is a security/UX violation.
 */
import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useRevealActions } from "../../../src/components/budgeting/spendings-grid/reveal-actions";

describe("useRevealActions", () => {
  it("starts with revealed=false", () => {
    const { result } = renderHook(() => useRevealActions());
    expect(result.current.revealed).toBe(false);
  });

  it("setRevealed(true) sets revealed=true", () => {
    const { result } = renderHook(() => useRevealActions());
    act(() => result.current.setRevealed(true));
    expect(result.current.revealed).toBe(true);
  });

  it("setRevealed(false) collapses", () => {
    const { result } = renderHook(() => useRevealActions());
    act(() => result.current.setRevealed(true));
    act(() => result.current.setRevealed(false));
    expect(result.current.revealed).toBe(false);
  });

  it("outside pointerdown sets revealed=false", () => {
    const { result } = renderHook(() => useRevealActions());
    act(() => result.current.setRevealed(true));
    // Simulate pointerdown outside the ref (no element attached)
    act(() => {
      document.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true }));
    });
    expect(result.current.revealed).toBe(false);
  });

  it("Escape key sets revealed=false", () => {
    const { result } = renderHook(() => useRevealActions());
    act(() => result.current.setRevealed(true));
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      );
    });
    expect(result.current.revealed).toBe(false);
  });

  it("non-Escape key does NOT collapse revealed", () => {
    const { result } = renderHook(() => useRevealActions());
    act(() => result.current.setRevealed(true));
    act(() => {
      document.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });
    expect(result.current.revealed).toBe(true);
  });

  it("REGRESSION-GUARD (D-PH4-INT1): pointermove does NOT set revealed=true", () => {
    const { result } = renderHook(() => useRevealActions());
    // setRevealed is the ONLY way to reveal — it is explicitly click-driven
    // Simulate pointermove over the element
    act(() => {
      document.dispatchEvent(
        new PointerEvent("pointermove", { bubbles: true }),
      );
    });
    // Still false — pointermove alone does NOT reveal
    expect(result.current.revealed).toBe(false);
  });

  it("exposes ref object", () => {
    const { result } = renderHook(() => useRevealActions());
    expect(result.current.ref).toBeDefined();
    expect(typeof result.current.ref).toBe("object");
  });
});
