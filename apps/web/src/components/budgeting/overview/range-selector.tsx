"use client";
/**
 * range-selector.tsx — shared Overview range selector (Phase 11, 11-09, DD-2).
 *
 * Segmented pill row (Month · 3M · Year · All · Custom); the active pill is
 * yellow-underlined. "Custom" reveals two native date inputs (from → to). Drives
 * the range-scoped sections only — the recurring charts + reserves bar ignore it.
 * Emits a resolved {preset, from, to} so callers key their RQ fetch off it.
 */
import { useState } from "react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import {
  type OverviewRange,
  type RangePreset,
  makeRange,
} from "@/lib/overview-range";

const PRESETS: { preset: Exclude<RangePreset, "custom">; key: string }[] = [
  { preset: "thisMonth", key: "month" },
  { preset: "last3Months", key: "3m" },
  { preset: "thisYear", key: "year" },
  { preset: "all", key: "all" },
];

export function RangeSelector({
  value,
  onChange,
}: {
  value: OverviewRange;
  onChange: (r: OverviewRange) => void;
}) {
  const t = useTranslations("bdp.tab.overview.range");
  const isCustom = value.preset === "custom";

  const pill = (label: string, active: boolean, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "shrink-0 border-b-2 px-3 py-1.5 text-num-sm transition-colors min-h-[44px] sm:min-h-0",
        active
          ? "border-[var(--primary)] text-[var(--body-on-dark)]"
          : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--body-on-dark)]",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      <div
        role="group"
        aria-label={t("month")}
        className="flex items-center gap-1 overflow-x-auto"
        data-testid="overview-range-selector"
      >
        {PRESETS.map((p) =>
          pill(t(p.key), value.preset === p.preset && !isCustom, () =>
            onChange(makeRange(p.preset)),
          ),
        )}
        {pill(t("custom"), isCustom, () =>
          onChange(makeRange("custom", { from: value.from, to: value.to })),
        )}
      </div>

      {isCustom && (
        <div className="flex flex-wrap items-center gap-2 text-num-sm">
          <label className="flex items-center gap-1 text-[var(--muted-foreground)]">
            {t("from")}
            <input
              type="date"
              value={value.from}
              max={value.to}
              onChange={(e) =>
                onChange(
                  makeRange("custom", { from: e.target.value, to: value.to }),
                )
              }
              className="rounded-[var(--radius-md)] border border-[var(--hairline-dark)] bg-[var(--surface-card-dark)] px-2 py-1 text-[var(--body-on-dark)]"
            />
          </label>
          <label className="flex items-center gap-1 text-[var(--muted-foreground)]">
            {t("to")}
            <input
              type="date"
              value={value.to}
              min={value.from}
              onChange={(e) =>
                onChange(
                  makeRange("custom", { from: value.from, to: e.target.value }),
                )
              }
              className="rounded-[var(--radius-md)] border border-[var(--hairline-dark)] bg-[var(--surface-card-dark)] px-2 py-1 text-[var(--body-on-dark)]"
            />
          </label>
        </div>
      )}
    </div>
  );
}
