"use client";
/**
 * range-selector.tsx — shared Overview range selector (Phase 11, 11-09, DD-2).
 *
 * Segmented pill row (Month · 3M · Year · All · Custom); the active pill is
 * yellow-underlined. "Custom" reveals two native date inputs (from → to). Drives
 * the range-scoped sections only — the recurring charts + reserves bar ignore it.
 * Emits a resolved {preset, from, to} so callers key their RQ fetch off it.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DateInput } from "@/components/budgeting/fields/date-input";
import { useUserTimezone } from "@/components/common/user-timezone-provider";
import { useConnectivity } from "@/components/common/connectivity-provider";
import {
  type OverviewRange,
  type RangePreset,
  canShiftRange,
  makeRange,
  shiftRange,
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
  // The persisted cache only ever holds the range that was last looked at, so
  // switching range with no way to fetch would answer with the numbers for a
  // DIFFERENT window — silently wrong, which is worse than not answering at all
  // (user, 260806). The strip goes inert until the link is back. No sentence
  // explaining it: the banner at the top of the page already says the app is
  // offline, and a second line saying it again was just noise (user, 260806).
  const { degraded } = useConnectivity();
  const locked = degraded;
  const isCustom = value.preset === "custom";

  // Only claim the finger when there is a horizontal swipe worth protecting.
  // touch-pan-x told the browser this strip owns every gesture that starts on
  // it, so a page scroll begun on the range row did nothing at all — and on a
  // phone the pills FIT, so there was no sideways swipe to protect (user,
  // 260805). Measured rather than assumed: it does overflow in some locales.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [scrolls, setScrolls] = useState(false);
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const measure = () => setScrolls(el.scrollWidth > el.clientWidth + 1);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Step the SAME window back and forward (260802 request). "All" already
  // reaches as far as the data goes, and forward stops at today — shown as a
  // disabled arrow rather than one that quietly does nothing.
  const step = (direction: -1 | 1) => {
    const label = direction < 0 ? t("previous") : t("next");
    const disabled = locked || !canShiftRange(value, direction, tz);
    const Icon = direction < 0 ? ChevronLeft : ChevronRight;
    return (
      <button
        type="button"
        onClick={() => onChange(shiftRange(value, direction, tz))}
        disabled={disabled}
        aria-label={label}
        title={label}
        data-testid={direction < 0 ? "range-step-back" : "range-step-forward"}
        className={cn(
          // Narrow but full-height: the pills need the width on a phone, the
          // finger needs the height.
          "flex w-8 shrink-0 items-center justify-center rounded-full transition-colors min-h-[44px] sm:min-h-0",
          disabled
            ? "cursor-not-allowed text-[var(--muted-foreground)] opacity-35"
            : "text-[var(--muted-foreground)] hover:text-[var(--body-on-dark)]",
        )}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </button>
    );
  };

  const pill = (label: string, active: boolean, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={locked}
      className={cn(
        // Tighter on a phone so the whole row — arrows included — fits without
        // scrolling; roomier once there is space for it.
        "shrink-0 border-b-2 px-2 py-1.5 text-num-sm transition-colors min-h-[44px] sm:min-h-0 sm:px-3",
        active
          ? "border-[var(--primary)] text-[var(--body-on-dark)]"
          : "border-transparent text-[var(--muted-foreground)] hover:text-[var(--body-on-dark)]",
        // Locked: dimmed but still legible — the member has to be able to read
        // which range they are looking at, which is the whole reason the strip
        // stays on screen (260806).
        locked && "cursor-not-allowed opacity-40 hover:text-inherit",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      {/* The arrows sit OUTSIDE the scroller: inside it they scrolled off the
          edge of a phone and the user never saw them (260802 report). */}
      <div className="flex items-center gap-1">
        {step(-1)}
        <div
          ref={scrollerRef}
          role="group"
          aria-label={t("month")}
          // touch-pan-x + overscroll-x-contain, but ONLY while the pills really
          // overflow: a horizontal swipe then stays horizontal and never chains
          // to the page, which is what stopped iOS Safari reading a swipe's
          // vertical drift as a page pan (the bar collapsed and the black canvas
          // flashed at the bottom — 260721). With nothing to swipe, that same
          // rule only blocked the page scroll (260805).
          className={cn(
            "flex flex-1 items-center justify-center gap-1 overflow-x-auto",
            scrolls && "touch-pan-x overscroll-x-contain",
          )}
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
            onChange(
              makeRange("custom", tz, { from: value.from, to: value.to }),
            ),
          )}
        </div>
        {step(1)}
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
