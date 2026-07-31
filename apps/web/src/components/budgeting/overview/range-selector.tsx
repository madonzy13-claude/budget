"use client";
/**
 * range-selector.tsx — shared Overview range selector (Phase 11, 11-09, DD-2).
 *
 * Segmented pill row (Month · 3M · Year · All · Custom); the active pill is
 * yellow-underlined. "Custom" reveals two native date inputs (from → to). Drives
 * the range-scoped sections only — the recurring charts + reserves bar ignore it.
 * Emits a resolved {preset, from, to} so callers key their RQ fetch off it.
 */
import { useTranslations } from "next-intl";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DateInput } from "@/components/budgeting/fields/date-input";
import { useUserTimezone } from "@/components/common/user-timezone-provider";
import {
  type OverviewRange,
  type RangePreset,
  makeRange,
} from "@/lib/overview-range";

// 1M/3M/6M are literal everywhere; 1Y ("1R"/"1Р"), All and Custom are translated
// (UAT round 10 item 3 + round 11 item 1) via their i18n keys.
const PRESETS: {
  preset: Exclude<RangePreset, "custom">;
  label?: string;
  i18nKey?: string;
}[] = [
  { preset: "thisMonth", label: "1M" },
  { preset: "last3Months", label: "3M" },
  { preset: "last6Months", label: "6M" },
  { preset: "last12Months", i18nKey: "year" },
  { preset: "all", i18nKey: "all" },
];

export function RangeSelector({
  value,
  onChange,
}: {
  value: OverviewRange;
  onChange: (r: OverviewRange) => void;
}) {
  const t = useTranslations("bdp.tab.overview.range");
  const tz = useUserTimezone();
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
        // touch-pan-x + overscroll-x-contain: a horizontal swipe on this scroller
        // stays horizontal and never chains to the page. Without it, iOS Safari
        // read a swipe's vertical drift as a page pan → the bar collapsed / the
        // page rubber-banded, flashing the black canvas at the bottom of the
        // screen when "passing" the range strip (user report, browser tab).
        className="flex touch-pan-x items-center justify-center gap-1 overflow-x-auto overscroll-x-contain"
        data-testid="overview-range-selector"
      >
        {PRESETS.map((p) =>
          pill(
            p.label ?? t(p.i18nKey as string),
            value.preset === p.preset && !isCustom,
            () => onChange(makeRange(p.preset, tz)),
          ),
        )}
        {pill(t("custom"), isCustom, () =>
          onChange(makeRange("custom", tz, { from: value.from, to: value.to })),
        )}
      </div>

      {isCustom && (
        /* 260731: one compact chip pair ("1 Jun 2026 → 30 Jun 2026") instead of
           two labelled boxes — the arrow carries the from/to meaning, so the
           row stays readable on a phone. The labels live on aria-label. */
        <div className="flex items-center justify-center gap-2 text-num-sm">
          <DateInput
            value={value.from}
            max={value.to}
            withIcon
            aria-label={t("from")}
            className="h-9 rounded-full border-[var(--hairline-dark)] bg-[var(--surface-elevated-dark)] pr-3"
            onChange={(next) =>
              onChange(makeRange("custom", tz, { from: next, to: value.to }))
            }
          />
          <ArrowRight
            aria-hidden="true"
            className="h-4 w-4 shrink-0 text-[var(--muted-foreground)]"
          />
          <DateInput
            value={value.to}
            min={value.from}
            withIcon
            aria-label={t("to")}
            className="h-9 rounded-full border-[var(--hairline-dark)] bg-[var(--surface-elevated-dark)] pr-3"
            onChange={(next) =>
              onChange(makeRange("custom", tz, { from: value.from, to: next }))
            }
          />
        </div>
      )}
    </div>
  );
}
