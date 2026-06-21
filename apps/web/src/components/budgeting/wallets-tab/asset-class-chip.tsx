"use client";
/**
 * asset-class-chip.tsx — Tiny inline badge (Phase 9, no-analog).
 *
 * Used in instrument-search suggestions to label the asset class, and reused for
 * the "Delisted" chip on dimmed rows. Per 09-UI-SPEC: --surface-elevated-dark
 * bg, --muted-foreground text, .text-caption, 20px height, 6px h-padding,
 * --radius-sm. Plain <span> — never a button.
 */
import * as React from "react";

interface AssetClassChipProps {
  label: string;
  /** role="status" re-announces a delisted transition (a11y). */
  role?: "status";
  className?: string;
}

export function AssetClassChip({ label, role, className }: AssetClassChipProps) {
  return (
    <span
      role={role}
      className={[
        "inline-flex h-5 shrink-0 items-center rounded-[var(--radius-sm)] px-1.5",
        "bg-[var(--surface-elevated-dark)] text-caption text-[var(--muted-foreground)]",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {label}
    </span>
  );
}
