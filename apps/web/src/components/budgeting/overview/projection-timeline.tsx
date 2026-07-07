"use client";
/**
 * projection-timeline.tsx — Overview cash-flow projection banner. A daily heat band
 * (green/yellow/red) from today → end of next month, with a danger-date headline.
 * Scrubber tooltip: hover/touch a day cell to see available + shortfall detail.
 */
import { useMemo, useState } from "react";
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

export function ProjectionTimeline({ budgetId }: { budgetId: string }) {
  const t = useTranslations("bdp.tab.overview.projection");
  const { data, isLoading, isError } = useProjection(budgetId);
  const [active, setActive] = useState<number | null>(null);

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
    if (first_red_date && Number(worst_shortfall_cents) > 0) {
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
      <div
        data-testid="projection-band"
        className="relative touch-none"
        onPointerLeave={() => setActive(null)}
        // Touch finger-slide: a touch pointer is implicitly captured by the cell it
        // started on, so per-cell onPointerEnter never fires on the siblings the
        // finger drags over. Resolve the day under the pointer by hit-testing
        // instead. onPointerEnter (below) still drives desktop hover + the initial
        // tap (and keeps this behaviour unit-testable — happy-dom's elementFromPoint
        // returns null, so this handler is a no-op there).
        onPointerMove={(e) => {
          const idx = document
            .elementFromPoint(e.clientX, e.clientY)
            ?.closest("[data-index]")
            ?.getAttribute("data-index");
          if (idx != null) setActive(Number(idx));
        }}
      >
        <div className="flex h-8 w-full min-w-0 gap-px overflow-hidden rounded-[var(--radius-md)]">
          {data.days.map((d, i) => (
            <span
              key={d.date}
              data-testid="projection-day"
              data-color={d.color}
              data-index={i}
              onPointerEnter={() => setActive(i)}
              className={cn(
                "h-full min-w-0 flex-1 cursor-pointer",
                COLOR_BG[d.color],
                active === i && "outline outline-2 outline-[var(--body-on-dark)]",
              )}
            />
          ))}
        </div>
        {active !== null && data.days[active] && (
          <ProjectionTooltip day={data.days[active]} currency={data.currency} t={t} />
        )}
      </div>
    </div>
  );
}

function ProjectionTooltip({
  day,
  currency,
  t,
}: {
  day: ProjectionDay;
  currency: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const money = (c: string) => centsToDisplayCompact(c, currency, "en");
  return (
    <div
      data-testid="projection-tooltip"
      className="pointer-events-none absolute left-1/2 top-full z-10 mt-2 w-max max-w-[240px] -translate-x-1/2 rounded-[var(--radius-md)] border border-[var(--hairline-dark)] bg-[var(--surface-card-dark)] p-3 text-xs shadow-lg"
    >
      <div className="mb-1 font-medium text-[var(--body-on-dark)]">
        {formatShortDate(day.date, "en")}
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-[var(--muted-foreground)]">{t("available")}</span>
        <span className="text-[var(--body-on-dark)]">{money(day.available_cents)}</span>
      </div>
      {day.drew_reserve.length > 0 && (
        <div className="mt-1">
          <div className="text-[var(--primary)]">{t("reserveShrinking")}</div>
          {day.drew_reserve.map((r) => (
            <div key={r.category_id} className="flex justify-between gap-4">
              <span>{r.name}</span>
              <span>{money(r.amount_cents)}</span>
            </div>
          ))}
        </div>
      )}
      {day.shortfall.length > 0 && (
        <div className="mt-1">
          <div className="text-[var(--trading-down)]">{t("cantCover")}</div>
          {day.shortfall.map((s) => (
            <div key={s.category_id} className="flex justify-between gap-4">
              <span>{s.name}</span>
              <span>{money(s.amount_cents)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
