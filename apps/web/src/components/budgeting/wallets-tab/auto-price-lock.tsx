"use client";
/**
 * auto-price-lock.tsx — R6 (user): the lock on an amount that prices itself.
 * Hover (mouse) or tap shows why it can't be typed and how it changes. The
 * tap is the lock's own — it never opens or closes the asset row.
 */
import { useState } from "react";
import { Lock } from "lucide-react";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";

export function AutoPriceLock({
  id,
  label,
  tip,
  className = "",
}: {
  id: string;
  label: string;
  tip: string;
  /** Placement — e.g. hung absolutely beside the amount. */
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <button
          type="button"
          data-testid={`asset-auto-lock-${id}`}
          aria-label={label}
          aria-expanded={open}
          onClick={(e) => {
            e.stopPropagation();
            // A mouse already opened it on hover — a click keeps it open; a
            // tap (no hover) toggles.
            setOpen((o) =>
              window.matchMedia?.("(hover: hover)").matches ? true : !o,
            );
          }}
          onPointerDown={stop}
          onPointerEnter={(e) => {
            if (e.pointerType === "mouse") setOpen(true);
          }}
          onPointerLeave={(e) => {
            if (e.pointerType === "mouse") setOpen(false);
          }}
          className={`inline-flex h-6 w-5 shrink-0 items-center justify-center rounded text-[var(--muted-foreground)] ${className}`}
        >
          <Lock className="h-3 w-3" aria-hidden="true" />
        </button>
      </PopoverAnchor>
      <PopoverContent
        data-testid="asset-auto-lock-tip"
        side="top"
        className="w-64 p-3 text-xs leading-relaxed"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onClick={stop}
      >
        {tip}
      </PopoverContent>
    </Popover>
  );
}
