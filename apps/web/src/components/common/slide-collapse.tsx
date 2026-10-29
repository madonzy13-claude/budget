"use client";
/**
 * slide-collapse.tsx — content that slides open / shut on CSS grid rows
 * (0fr ↔ 1fr, no measured heights). Round-4 gaps 18 + 19: the FIRST open
 * slides too — it mounts shut and opens on the next frame (mounting straight
 * at 1fr gave no transition) — and a close slides before it unmounts.
 *
 * - keepMounted: stay mounted once opened (the asset ledger keeps its data).
 * - instant: no slide (a type block collapsing under a drag must not move).
 * The clip is vertical only, so a horizontally swiped child is never cut.
 */
import { useEffect, useRef, useState } from "react";

const MS = 200;

export function SlideCollapse({
  open,
  keepMounted = false,
  instant = false,
  children,
  className = "",
  ...rest
}: {
  open: boolean;
  keepMounted?: boolean;
  instant?: boolean;
  children: React.ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, "children">) {
  const [mounted, setMounted] = useState(open);
  const [expanded, setExpanded] = useState(instant && open);
  const opened = useRef(expanded);
  opened.current = expanded;
  if (open && !mounted) setMounted(true);

  useEffect(() => {
    if (instant) {
      setExpanded(open);
      if (!open && !keepMounted) setMounted(false);
      return;
    }
    if (open) {
      const raf = requestAnimationFrame(() => setExpanded(true));
      return () => cancelAnimationFrame(raf);
    }
    setExpanded(false);
    if (keepMounted) return;
    // Closed before it ever opened (e.g. a remembered collapse restored
    // after the first paint): no slide, just gone.
    if (!opened.current) {
      setMounted(false);
      return;
    }
    const timer = setTimeout(() => setMounted(false), MS + 20);
    return () => clearTimeout(timer);
  }, [open, instant, keepMounted]);

  if (!mounted) return null;
  const shown = instant ? open : expanded;
  return (
    <div
      {...rest}
      aria-hidden={!open || undefined}
      inert={!open || undefined}
      // minmax(0, 1fr): an implicit `auto` column grows to its content's
      // min-content and widened the whole block past the phone (gap 24).
      style={{
        ...rest.style,
        gridTemplateRows: shown ? "1fr" : "0fr",
        gridTemplateColumns: "minmax(0, 1fr)",
      }}
      className={`grid ${instant ? "" : "transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none"} ${className}`}
    >
      <div
        className="min-h-0"
        style={{ overflowY: "clip", overflowX: "visible" }}
      >
        {children}
      </div>
    </div>
  );
}
