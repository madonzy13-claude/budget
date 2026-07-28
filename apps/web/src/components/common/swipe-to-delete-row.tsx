"use client";
/**
 * swipe-to-delete-row.tsx — mobile swipe-left-to-reveal-Delete wrapper.
 *
 * Ported from the wallet-row gesture (the same UAT-hardened native-pointer
 * implementation): passive:false pointer listeners so preventDefault works during
 * an active horizontal swipe, a suppress-click window after release, and an
 * opacity-gated Delete button behind the row's right edge. Desktop is untouched
 * (the caller keeps its own hover trash); this only adds the mobile swipe.
 */
import { useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";

const ACTION_W = 88;

export function SwipeToDeleteRow({
  onDelete,
  deleteAriaLabel,
  children,
}: {
  onDelete: () => void;
  deleteAriaLabel: string;
  children: React.ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const [swiping, setSwiping] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const offsetRef = useRef(0);
  const suppressClickUntilRef = useRef(0);

  useEffect(() => {
    offsetRef.current = offset;
  }, [offset]);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const state = { x: 0, y: 0, base: 0, locked: false, pid: -1 };

    const isInteractive = (target: EventTarget | null) => {
      const node = target as HTMLElement | null;
      if (!node) return false;
      if (node.closest('[data-editing="true"]')) return true;
      if (node.closest("[data-no-swipe]")) return true;
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
      setOffset(Math.max(-ACTION_W, Math.min(0, state.base + dx)));
    };

    const onPointerUp = (e: PointerEvent) => {
      if (state.pid !== e.pointerId) return;
      if (state.locked) {
        setOffset(offsetRef.current <= -ACTION_W / 2 ? -ACTION_W : 0);
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
  }, []);

  return (
    <div ref={wrapperRef} className="relative">
      <button
        data-no-swipe
        aria-label={deleteAriaLabel}
        aria-hidden={offset === 0}
        tabIndex={offset === 0 ? -1 : 0}
        onClick={() => onDelete()}
        style={{
          opacity: Math.min(1, Math.abs(offset) / ACTION_W),
          pointerEvents: offset === 0 ? "none" : "auto",
          transition: swiping ? "none" : "opacity 200ms ease-out",
        }}
        className="absolute right-0 top-0 bottom-0 flex w-20 items-center justify-center rounded-[var(--radius-md)] bg-[var(--destructive)] text-white sm:hidden"
      >
        <Trash2 className="h-5 w-5" aria-hidden="true" />
      </button>
      <div
        style={{
          transform: `translateX(${offset}px)`,
          transition: swiping ? "none" : undefined,
        }}
      >
        {children}
      </div>
    </div>
  );
}
