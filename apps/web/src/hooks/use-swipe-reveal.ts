"use client";
/**
 * use-swipe-reveal.ts — the native-pointer swipe-to-reveal gesture, lifted
 * verbatim from investment-row-sheet.tsx (13.1-20) so asset rows and ledger
 * rows share one iOS-proven implementation. Mirrors wallet-row.tsx: touch/pen
 * only, axis lock at 10px, passive:false so preventDefault works mid-swipe,
 * snap open at half the action width, and the click right after a swipe is
 * swallowed. `[data-no-swipe]` and drag grips never start a swipe.
 */
import { useEffect, useRef, useState, type RefObject } from "react";

export function useSwipeReveal(
  ref: RefObject<HTMLElement | null>,
  actionWidth: number,
  /** onOffset: every offset change; `live` = mid-gesture (no transition). */
  opts: {
    onOffset?: (px: number, live: boolean) => void;
    disabled?: boolean;
  } = {},
) {
  const [offset, setOffsetState] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const offsetRef = useRef(0);
  const suppressClickUntilRef = useRef(0);
  const onOffsetRef = useRef(opts.onOffset);
  onOffsetRef.current = opts.onOffset;

  const setOffset = (px: number, live = false) => {
    offsetRef.current = px;
    setOffsetState(px);
    onOffsetRef.current?.(px, live);
  };
  const setOffsetRef = useRef(setOffset);
  setOffsetRef.current = setOffset;

  useEffect(() => {
    const el = ref.current;
    if (!el || opts.disabled) return;
    const state = { x: 0, y: 0, base: 0, locked: false, pid: -1 };

    const isInteractive = (target: EventTarget | null) => {
      const node = target as HTMLElement | null;
      if (!node) return false;
      if (node.closest("[data-no-swipe]")) return true;
      if (node.closest('[data-testid^="drag-grip-"]')) return true;
      return false;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== "touch" && e.pointerType !== "pen") return;
      if (isInteractive(e.target)) return;
      state.x = e.clientX;
      state.y = e.clientY;
      state.base = offsetRef.current;
      state.locked = false;
      state.pid = e.pointerId;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (state.pid !== e.pointerId) return;
      const dx = e.clientX - state.x;
      const dy = e.clientY - state.y;
      if (!state.locked) {
        if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          state.pid = -1;
          return;
        }
        state.locked = true;
        setSwiping(true);
        try {
          el.setPointerCapture(e.pointerId);
        } catch {
          /* best-effort */
        }
      }
      if (e.cancelable) e.preventDefault();
      setOffsetRef.current(
        Math.max(-actionWidth, Math.min(0, state.base + dx)),
        true,
      );
    };

    const onPointerUp = (e: PointerEvent) => {
      if (state.pid !== e.pointerId) return;
      if (state.locked) {
        setOffsetRef.current(
          offsetRef.current <= -actionWidth / 2 ? -actionWidth : 0,
        );
        setSwiping(false);
        suppressClickUntilRef.current = Date.now() + 400;
        try {
          el.releasePointerCapture(e.pointerId);
        } catch {
          /* best-effort */
        }
      }
      state.x = 0;
      state.y = 0;
      state.base = 0;
      state.locked = false;
      state.pid = -1;
    };

    const onClickCapture = (e: MouseEvent) => {
      if (Date.now() < suppressClickUntilRef.current) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    el.addEventListener("pointerdown", onPointerDown);
    el.addEventListener("pointermove", onPointerMove, { passive: false });
    el.addEventListener("pointerup", onPointerUp);
    el.addEventListener("pointercancel", onPointerUp);
    el.addEventListener("click", onClickCapture, true);
    return () => {
      el.removeEventListener("pointerdown", onPointerDown);
      el.removeEventListener("pointermove", onPointerMove);
      el.removeEventListener("pointerup", onPointerUp);
      el.removeEventListener("pointercancel", onPointerUp);
      el.removeEventListener("click", onClickCapture, true);
    };
  }, [ref, actionWidth, opts.disabled]);

  return { offset, swiping, close: () => setOffset(0) };
}
