"use client";
/**
 * slide-on-change.tsx — directional slide-in when `token` changes (260618 UX).
 *
 * Wraps content in a STABLE div and replays a CSS slide-in keyframe whenever the
 * token (a tab index, a month ordinal, …) changes — WITHOUT remounting children
 * (re-trigger is `remove class → force reflow → add class`, so React state /
 * scroll / focus inside the children are preserved; vital for the spendings
 * grid which must not refetch on a month change).
 *
 * Direction: forward (token increased → enters from the right) vs back (token
 * decreased → enters from the left). Honors prefers-reduced-motion (no animation,
 * content just appears). Degrades on browsers without CSS animations (instant).
 *
 * Why CSS, not React's <ViewTransition>: that component ships only in React's
 * experimental/canary build; on stable React 19.2 it isn't exported. The CSS
 * slide is visually equivalent and works on the stable stack.
 */
import { useLayoutEffect, useRef } from "react";

const FORWARD = "slide-in-forward";
const BACK = "slide-in-back";

interface SlideOnChangeProps {
  /** Monotonic-ish value identifying the current view; change drives the slide. */
  token: number;
  className?: string;
  children: React.ReactNode;
}

export function SlideOnChange({
  token,
  className,
  children,
}: SlideOnChangeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const prev = useRef(token);

  useLayoutEffect(() => {
    if (prev.current === token) return;
    const dir = token > prev.current ? FORWARD : BACK;
    prev.current = token;

    const el = ref.current;
    if (!el) return;
    if (
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }
    // Re-trigger the animation without remounting: drop both classes, force a
    // reflow so the browser registers the removal, then add the directional one.
    el.classList.remove(FORWARD, BACK);
    void el.offsetWidth;
    el.classList.add(dir);
  }, [token]);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
