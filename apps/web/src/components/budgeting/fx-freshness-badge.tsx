"use client";

/**
 * fx-freshness-badge.tsx — pure-render badge showing humanized age of an FX rate.
 * Uses next-intl formatRelativeTime to localize the age string.
 * Shown beneath stale-rate amounts on transaction list rows and in the capture form preview.
 */
import { useFormatter, useTranslations } from "next-intl";

interface FxFreshnessBadgeProps {
  /** ISO date string 'YYYY-MM-DD' or ISO timestamp for when the rate was fetched. */
  fxRateDate: string;
  /** FX provider name (e.g. "frankfurter"). Appended after the age. */
  provider?: string;
  /** Additional CSS classes. */
  className?: string;
}

/**
 * Renders "rate {age}" (e.g. "rate 2 hours ago") using the `budgeting.fx.freshnessBadge`
 * i18n key. The age is computed relative to `now` at render time.
 *
 * For testability, `now` is accepted as an optional prop (default: Date.now).
 */
export function FxFreshnessBadge({
  fxRateDate,
  provider,
  className,
}: FxFreshnessBadgeProps) {
  const t = useTranslations("budgeting.fx");
  const format = useFormatter();

  const rateDate = new Date(fxRateDate);
  const now = new Date();

  // formatRelativeTime returns a localised string like "2 hours ago"
  const age = format.relativeTime(rateDate, now);
  const badgeText = t("freshnessBadge", { age });

  return (
    <span
      className={[
        "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] font-medium",
        "bg-[color-mix(in_oklab,var(--muted)_60%,transparent)]",
        "text-[var(--muted-foreground)]",
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="fx-freshness-badge"
    >
      {badgeText}
      {provider && (
        <span className="opacity-60" data-testid="fx-freshness-provider">
          · {provider}
        </span>
      )}
    </span>
  );
}
