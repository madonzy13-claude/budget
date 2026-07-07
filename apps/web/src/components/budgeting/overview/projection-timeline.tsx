"use client";
/**
 * projection-timeline.tsx — Overview cash-flow projection banner. A daily heat band
 * (green/yellow/red) from today → end of next month, with a danger-date headline.
 * The scrubber tooltip is layered on in a follow-up (Task 6).
 */
import { useMemo } from "react";
import { useTranslations } from "next-intl";
import { useProjection, type ProjectionDay } from "@/hooks/use-projection";
import { centsToDisplayCompact } from "@/lib/cents-format";
import { formatShortDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const CARD =
  "rounded-[var(--radius-xl)] bg-[var(--surface-card-dark)] border border-[var(--hairline-dark)] p-4 min-w-0";

const COLOR_BG: Record<ProjectionDay["color"], string> = {
  green: "bg-[var(--trading-up)]",
  yellow: "bg-[var(--primary)]",
  red: "bg-[var(--trading-down)]",
};

export function ProjectionTimeline({
  budgetId,
  currency = "USD",
}: {
  budgetId: string;
  currency?: string;
}) {
  const t = useTranslations("bdp.tab.overview.projection");
  const { data, isLoading, isError } = useProjection(budgetId);

  const headline = useMemo(() => {
    if (!data) return "";
    const { first_yellow_date, first_red_date, worst_shortfall_cents } =
      data.summary;
    const firstTrouble = first_yellow_date ?? first_red_date;
    if (!firstTrouble) {
      const last = data.days.at(-1);
      return last
        ? t("onTrackThrough", { date: formatShortDate(last.date, "en") })
        : "";
    }
    const around = t("tightAround", {
      date: formatShortDate(firstTrouble, "en"),
    });
    if (first_red_date && worst_shortfall_cents !== "0") {
      return `${around} · ${t("shortBy", {
        amount: centsToDisplayCompact(
          worst_shortfall_cents,
          data.currency,
          "en",
        ),
      })}`;
    }
    return around;
  }, [data, t]);

  if (isLoading) {
    return <div className={cn(CARD, "h-[92px] animate-pulse")} aria-hidden />;
  }
  if (isError || !data || data.days.length === 0) {
    return (
      <div className={CARD}>
        <p className="text-sm text-[var(--muted-foreground)]">{t("empty")}</p>
      </div>
    );
  }

  return (
    <div className={CARD} data-testid="projection-timeline">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium text-[var(--body-on-dark)]">
          {t("title")}
        </h3>
        <span
          data-testid="projection-headline"
          className="truncate text-xs text-[var(--muted-foreground)]"
        >
          {headline}
        </span>
      </div>
      <div className="flex h-8 w-full min-w-0 gap-px overflow-hidden rounded-[var(--radius-md)]">
        {data.days.map((d) => (
          <span
            key={d.date}
            data-testid="projection-day"
            data-color={d.color}
            title={`${formatShortDate(d.date, "en")} · ${centsToDisplayCompact(
              d.available_cents,
              data.currency,
              "en",
            )}`}
            className={cn("h-full min-w-0 flex-1", COLOR_BG[d.color])}
          />
        ))}
      </div>
    </div>
  );
}
