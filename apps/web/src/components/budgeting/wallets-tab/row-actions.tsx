"use client";

import { MoreHorizontal } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Desktop row actions behind a "…" (261102, user: the row of always-there
 * icons looked cluttered). Hovering — or focusing — the "…" fades the actions
 * in just LEFT of it, over the right end of the row, on a blurred backdrop
 * that dims the figures underneath. The "…" itself stays put: had the panel
 * covered it, the pointer would land on Delete the moment it opened. The row must be `relative` and `group/row` (the "…"
 * shows on row hover / keyboard highlight).
 *
 * Phones never see the "…": `mobile="contents"` dissolves both wrappers so the
 * buttons keep their own swipe-reveal placement; `mobile="hidden"` drops the
 * whole thing (the row has its own swipe sheet).
 */
export function RowActions({
  label,
  mobile,
  tint = "var(--surface-card-dark)",
  className,
  testId,
  children,
}: {
  label: string;
  mobile: "contents" | "hidden";
  /** The row's own surface — the blur is tinted with it. */
  tint?: string;
  className?: string;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-row-actions
      data-testid={testId}
      className={cn(
        mobile === "contents" ? "contents" : "hidden",
        "group/actions sm:relative sm:flex sm:w-7 sm:shrink-0 sm:items-center sm:justify-end sm:self-stretch",
        className,
      )}
    >
      <button
        type="button"
        data-testid="row-actions-more"
        aria-label={label}
        aria-haspopup="true"
        onClick={(e) => e.stopPropagation()}
        className="hidden h-7 w-7 items-center justify-center rounded text-[var(--muted-foreground)] opacity-0 transition-opacity focus-visible:opacity-100 group-hover/row:opacity-100 group-data-[nav-highlighted=true]/row:opacity-100 sm:flex"
      >
        <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
      </button>
      <div
        role="toolbar"
        aria-label={label}
        className={cn(
          mobile === "contents" ? "contents" : "",
          "sm:pointer-events-none sm:absolute sm:inset-y-0 sm:right-full sm:z-10 sm:flex sm:min-w-[180px] sm:items-center sm:justify-end sm:gap-1 sm:pl-12 sm:pr-1",
          "sm:translate-x-2 sm:opacity-0 sm:backdrop-blur-md sm:transition-[opacity,transform] sm:duration-200 sm:ease-out sm:[mask-image:linear-gradient(to_right,transparent,black_40px)]",
          "sm:group-hover/actions:pointer-events-auto sm:group-hover/actions:translate-x-0 sm:group-hover/actions:opacity-100",
          "sm:group-focus-within/actions:pointer-events-auto sm:group-focus-within/actions:translate-x-0 sm:group-focus-within/actions:opacity-100",
        )}
        style={
          {
            background: `color-mix(in srgb, ${tint} 55%, transparent)`,
          } as CSSProperties
        }
      >
        {children}
      </div>
    </div>
  );
}

/** Desktop look of a button inside RowActions (phones keep their own). */
export const ROW_ACTION_BUTTON =
  "sm:static sm:flex sm:h-8 sm:w-8 sm:items-center sm:justify-center sm:rounded-[var(--radius-sm)] sm:translate-y-0 sm:bg-transparent sm:shadow-none sm:opacity-100 sm:pointer-events-auto sm:hover:bg-[var(--surface-elevated-dark)]";

/** Desktop: hidden until its `group/row` is hovered, focused or keyboard-
 *  highlighted — `invisible` keeps the column's width so nothing shifts. */
export const REVEAL_ON_ROW =
  "sm:invisible sm:group-hover/row:visible sm:group-focus-within/row:visible sm:group-data-[nav-highlighted=true]/row:visible";
