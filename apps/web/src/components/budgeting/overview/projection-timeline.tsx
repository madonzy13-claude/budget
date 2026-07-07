"use client";
/**
 * projection-timeline.tsx — Overview cash-flow projection banner. A fluent
 * colour-flowing line (green→yellow→red) from today → end of next month: a single
 * horizontal CSS gradient whose stops are the per-day zone colours (no discrete
 * segments). Income (▲) and recurring-bill (●) markers sit on the timeline. A
 * scrubber (pointer hover + touch finger-slide) shows a tooltip ABOVE the line so
 * the finger never covers it. The danger-date summary is a caption under the line;
 * the header is a single-line title.
 */
import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { useProjection, type ProjectionDay } from "@/hooks/use-projection";
import { centsToDisplayCompact } from "@/lib/cents-format";
import { formatShortDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";

const CARD =
  "rounded-[var(--radius-xl)] bg-[var(--surface-card-dark)] border border-[var(--hairline-dark)] p-4 min-w-0";

const COLOR_VAR: Record<ProjectionDay["color"], string> = {
  green: "var(--trading-up)",
  yellow: "var(--primary)",
  red: "var(--trading-down)",
};

/** Clamp helper. */
const clamp = (n: number, lo: number, hi: number) =>
  n < lo ? lo : n > hi ? hi : n;

export function ProjectionTimeline({ budgetId }: { budgetId: string }) {
  const t = useTranslations("bdp.tab.overview.projection");
  const { data, isLoading, isError } = useProjection(budgetId);
  const [active, setActive] = useState<number | null>(null);

  const n = data?.days.length ?? 0;

  // Fluent colour line: one gradient stop per day at its x%, so the colour flows
  // continuously across zones instead of rendering discrete cells.
  const gradient = useMemo(() => {
    if (!data || n === 0) return undefined;
    const stops = data.days
      .map((d, i) => {
        const pct = n === 1 ? 0 : (i / (n - 1)) * 100;
        return `${COLOR_VAR[d.color]} ${pct.toFixed(2)}%`;
      })
      .join(", ");
    return `linear-gradient(90deg, ${stops})`;
  }, [data, n]);

  // date → day index, for placing income/bill markers on the line.
  const indexByDate = useMemo(() => {
    const m = new Map<string, number>();
    data?.days.forEach((d, i) => m.set(d.date, i));
    return m;
  }, [data]);

  const pctFor = (date: string): number | null => {
    const i = indexByDate.get(date);
    if (i === undefined || n <= 1) return i === undefined ? null : 0;
    return (i / (n - 1)) * 100;
  };

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
    return <div className={cn(CARD, "h-[104px] animate-pulse")} aria-hidden />;
  }
  if (isError || !data || n === 0) {
    return (
      <div className={CARD}>
        <p className="text-sm text-[var(--muted-foreground)]">{t("empty")}</p>
      </div>
    );
  }

  // Pointer x → nearest day index (works for mouse move AND touch finger-slide;
  // getBoundingClientRect returns 0s in happy-dom, so guard NaN — the unit test
  // drives selection via per-cell onPointerEnter instead).
  const selectFromClientX = (clientX: number, el: HTMLElement) => {
    const rect = el.getBoundingClientRect();
    if (!rect.width) return;
    const frac = (clientX - rect.left) / rect.width;
    setActive(clamp(Math.round(frac * (n - 1)), 0, n - 1));
  };

  const activePct = active === null || n <= 1 ? 0 : (active / (n - 1)) * 100;

  return (
    <div className={CARD} data-testid="projection-timeline">
      <h3 className="mb-3 truncate text-sm font-medium text-[var(--body-on-dark)]">
        {t("title")}
      </h3>

      <div
        data-testid="projection-band"
        className="relative h-9 touch-none select-none"
        onPointerLeave={() => setActive(null)}
        onPointerMove={(e) => selectFromClientX(e.clientX, e.currentTarget)}
        onPointerDown={(e) => selectFromClientX(e.clientX, e.currentTarget)}
      >
        {/* Fluent colour line (visual). */}
        <div
          className="absolute inset-x-0 top-1/2 h-3 -translate-y-1/2 rounded-full"
          style={{ background: gradient }}
        />

        {/* Recurring-bill markers (money OUT): red ▼ above the line, pointing at
            it. Inline-styled colour so a Tailwind arbitrary-value ambiguity can't
            drop it. */}
        {data.bill_points.map((b, i) => {
          const pct = pctFor(b.date);
          if (pct === null) return null;
          return (
            <span
              key={`bill-${i}`}
              data-testid="projection-bill-marker"
              aria-hidden
              className="absolute top-0 z-[2] size-0 -translate-x-1/2"
              style={{
                left: `${pct}%`,
                borderLeft: "5px solid transparent",
                borderRight: "5px solid transparent",
                borderTop: "7px solid var(--trading-down)",
              }}
            />
          );
        })}

        {/* Income markers (money IN): green ▲ below the line, pointing up. */}
        {data.income_points.map((p, i) => {
          const pct = pctFor(p.date);
          if (pct === null) return null;
          return (
            <span
              key={`inc-${i}`}
              data-testid="projection-income-marker"
              aria-hidden
              className="absolute bottom-0 z-[2] size-0 -translate-x-1/2"
              style={{
                left: `${pct}%`,
                borderLeft: "5px solid transparent",
                borderRight: "5px solid transparent",
                borderBottom: "7px solid var(--trading-up)",
              }}
            />
          );
        })}

        {/* Scrubber cursor. */}
        {active !== null && (
          <span
            aria-hidden
            className="absolute top-1/2 z-[2] h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded bg-[var(--body-on-dark)]"
            style={{ left: `${activePct}%` }}
          />
        )}

        {/* Transparent per-day hit cells (interaction + E2E/unit test). */}
        <div className="absolute inset-0 flex">
          {data.days.map((d, i) => (
            <span
              key={d.date}
              data-testid="projection-day"
              data-color={d.color}
              data-index={i}
              onPointerEnter={() => setActive(i)}
              className="h-full min-w-0 flex-1 cursor-pointer"
            />
          ))}
        </div>

        {active !== null && data.days[active] && (
          <ProjectionTooltip
            day={data.days[active]}
            bills={data.bill_points.filter(
              (b) => b.date === data.days[active]!.date,
            )}
            incomes={data.income_points.filter(
              (p) => p.date === data.days[active]!.date,
            )}
            leftPct={clamp(activePct, 12, 88)}
            currency={data.currency}
            t={t}
          />
        )}
      </div>

      {/* Danger-date summary caption (one line, under the line). */}
      <p
        data-testid="projection-headline"
        className="mt-2 truncate text-xs text-[var(--muted-foreground)]"
      >
        {headline}
      </p>
    </div>
  );
}

function ProjectionTooltip({
  day,
  bills,
  incomes,
  leftPct,
  currency,
  t,
}: {
  day: ProjectionDay;
  bills: { name: string; category_id: string | null; amount_cents: string }[];
  incomes: { name: string; amount_cents: string }[];
  leftPct: number;
  currency: string;
  t: ReturnType<typeof useTranslations>;
}) {
  const money = (c: string) => centsToDisplayCompact(c, currency, "en");
  return (
    <div
      data-testid="projection-tooltip"
      // ABOVE the line (bottom-full) so a finger never covers it; follows the
      // active day's x, clamped inside the card.
      style={{ left: `${leftPct}%` }}
      className="pointer-events-none absolute bottom-full z-10 mb-2 w-max max-w-[240px] -translate-x-1/2 rounded-[var(--radius-md)] border border-[var(--hairline-dark)] bg-[var(--surface-card-dark)] p-3 text-xs shadow-lg"
    >
      <div className="mb-1 font-medium text-[var(--body-on-dark)]">
        {formatShortDate(day.date, "en")}
      </div>
      <div className="flex justify-between gap-4">
        <span className="text-[var(--muted-foreground)]">{t("available")}</span>
        <span className="text-[var(--body-on-dark)]">
          {money(day.available_cents)}
        </span>
      </div>
      {incomes.length > 0 && (
        <div className="mt-1">
          <div className="text-[var(--trading-up)]">{t("income")}</div>
          {incomes.map((p, i) => (
            <div key={`i-${i}`} className="flex justify-between gap-4">
              <span>{p.name || t("income")}</span>
              <span>{money(p.amount_cents)}</span>
            </div>
          ))}
        </div>
      )}
      {bills.length > 0 && (
        <div className="mt-1">
          <div className="text-[var(--muted-foreground)]">{t("bill")}</div>
          {bills.map((b, i) => (
            <div key={`b-${i}`} className="flex justify-between gap-4">
              <span>{b.name || t("bill")}</span>
              <span>{money(b.amount_cents)}</span>
            </div>
          ))}
        </div>
      )}
      {Number(day.reserve_cover_cents) > 0 && (
        <div className="mt-1 flex justify-between gap-4">
          <span className="text-[var(--primary)]">{t("reserveCovering")}</span>
          <span>{money(day.reserve_cover_cents)}</span>
        </div>
      )}
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
