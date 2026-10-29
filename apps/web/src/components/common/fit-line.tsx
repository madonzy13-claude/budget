"use client";
/**
 * fit-line.tsx — one line that never wraps. When the content is wider than
 * the line it slowly scrolls to show the end, waits, and comes back (round-4
 * gap 17: "realized" did not fit the type header's caption). Still when it
 * fits; still under prefers-reduced-motion (global.css).
 *
 * `until`: the line may reach right up to that element (minus a gap), so free
 * room is used before anything scrolls. A scrolling line fades both edges.
 */
import { useLayoutEffect, useRef, useState } from "react";

const GAP = 8;

export function FitLine({
  children,
  className = "",
  style,
  until,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement> & {
  until?: React.RefObject<HTMLElement | null>;
}) {
  const outer = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [room, setRoom] = useState<number | null>(null);
  const [shift, setShift] = useState(0);

  useLayoutEffect(() => {
    const measure = () => {
      const o = outer.current;
      const i = inner.current;
      if (!o || !i) return;
      const stop = until?.current;
      const avail = stop
        ? Math.max(
            o.clientWidth,
            stop.getBoundingClientRect().left -
              o.getBoundingClientRect().left -
              GAP,
          )
        : o.clientWidth;
      setRoom((r) => (!stop ? null : r === avail ? r : avail));
      const over = Math.max(0, i.scrollWidth - avail);
      setShift((s) => (s === over ? s : over));
    };
    measure();
    // `until` usually renders after this line, so its ref is attached only
    // once the commit is done — measure (and watch it) again next frame.
    let ro: ResizeObserver | null = null;
    const raf = requestAnimationFrame(() => {
      measure();
      if (typeof ResizeObserver === "undefined") return;
      ro = new ResizeObserver(measure);
      for (const el of [outer.current, inner.current, until?.current])
        if (el) ro.observe(el);
    });
    return () => {
      cancelAnimationFrame(raf);
      ro?.disconnect();
    };
  }, [children, until]);

  return (
    <span
      ref={outer}
      {...rest}
      className={`block min-w-0 overflow-hidden whitespace-nowrap ${shift > 0 ? "fit-line-fade" : ""} ${className}`}
      style={room !== null ? { ...style, width: `${room}px` } : style}
    >
      <span
        ref={inner}
        className={`inline-flex gap-x-2 ${shift > 0 ? "fit-line-scroll" : ""}`}
        style={
          shift > 0
            ? ({ "--fit-shift": `-${shift}px` } as React.CSSProperties)
            : undefined
        }
      >
        {children}
      </span>
    </span>
  );
}
