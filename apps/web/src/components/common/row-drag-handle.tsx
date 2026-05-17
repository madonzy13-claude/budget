"use client";
/**
 * row-drag-handle.tsx — Shared drag handle atom.
 *
 * Lifted from Phase 4 column-header.tsx inline snippet.
 * D-PH4-D3: GripVertical always visible; touch-action:none.
 * Spreads @dnd-kit useDraggable listeners/attributes onto the span.
 */
import * as React from "react";
import { GripVertical } from "lucide-react";

export interface RowDragHandleProps {
  name: string; // Used in testid + aria-label
  listeners?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  className?: string;
  ariaLabel?: string;
}

export function RowDragHandle({
  name,
  listeners,
  attributes,
  className,
  ariaLabel,
}: RowDragHandleProps) {
  return (
    <span
      data-testid={`drag-grip-${name.toLowerCase()}`}
      style={{ touchAction: "none" }}
      className={
        className ??
        "touch-none cursor-grab text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
      }
      aria-label={ariaLabel ?? `Drag to move ${name}`}
      role="button"
      {...attributes}
      {...listeners}
    >
      <GripVertical className="h-4 w-4" aria-hidden={true} />
    </span>
  );
}
