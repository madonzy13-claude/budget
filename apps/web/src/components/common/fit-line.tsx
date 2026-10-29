"use client";
/**
 * fit-line.tsx — one line that never wraps. When the content is wider than
 * the line it slowly scrolls to show the end, waits, and comes back (round-4
 * gap 17: "realized" did not fit the type header's caption). Still when it
 * fits; still under prefers-reduced-motion (global.css).
 */
import { useLayoutEffect, useRef, useState } from "react";

export function FitLine({
  children,
  className = "",
  style,
  ...rest
}: React.HTMLAttributes<HTMLSpanElement>) {
  const outer = useRef<HTMLSpanElement>(null);
  const inner = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);

  useLayoutEffect(() => {
    const measure = () => {
      const o = outer.current;
      const i = inner.current;
      if (!o || !i) return;
      const over = Math.max(0, i.scrollWidth - o.clientWidth);
      setShift((s) => (s === over ? s : over));
    };
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    if (outer.current) ro.observe(outer.current);
    if (inner.current) ro.observe(inner.current);
    return () => ro.disconnect();
  }, [children]);

  return (
    <span
      ref={outer}
      {...rest}
      className={`block min-w-0 overflow-hidden whitespace-nowrap ${className}`}
      style={style}
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
