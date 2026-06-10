"use client";
/**
 * reveal-actions.tsx — Universal single-click reveal hook (Pattern 5).
 *
 * @do-not-add onMouseEnter — D-PH4-INT1 forbids hover-reveal.
 * T-04-03-05: regression test verifies pointermove does NOT call setRevealed.
 *
 * Usage:
 *   const { revealed, setRevealed, ref } = useRevealActions();
 *   <div ref={ref} onClick={() => setRevealed(true)}>
 *     {revealed && <ActionChips />}
 *   </div>
 */
import { useState, useRef, useEffect } from "react";

export function useRevealActions() {
  const [revealed, setRevealed] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!revealed) return;

    function onPointerDown(e: PointerEvent) {
      if (!ref.current || !ref.current.contains(e.target as Node)) {
        setRevealed(false);
      }
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setRevealed(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [revealed]);

  return { revealed, setRevealed, ref };
}
