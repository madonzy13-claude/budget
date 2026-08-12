"use client";
/**
 * projection-timeline.tsx — Overview cash-flow projection banner. A fluent
 * colour-flowing line (green→yellow→red) over the next 100 days: a single
 * horizontal CSS gradient whose stops are the per-day zone colours (no discrete
 * segments) carrying the month names inside it. Income (▲) and scheduled-bill
 * (●) markers sit on the timeline. A
 * scrubber (pointer hover + touch finger-slide) shows a tooltip ABOVE the line so
 * the finger never covers it. The danger-date summary is a caption under the line;
 * the header is a single-line title.
 */
import { useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { useProjection, type ProjectionDay } from "@/hooks/use-projection";
import { centsToDisplayCompact } from "@/lib/cents-format";
import { SlotAmount } from "@/components/budgeting/overview/slot-amount";
import { formatShortDate, formatDayMonth } from "@/lib/format-date";
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

/** Round cents to whole units so amounts render without decimals. */
const roundToUnit = (cents: string): string =>
  String(Math.round(Number(cents) / 100) * 100);

export function ProjectionTimeline({
  budgetId,
  amountPrivacyEnabled = true,
}: {
  budgetId: string;
  amountPrivacyEnabled?: boolean;
}) {
  const t = useTranslations("bdp.tab.overview.projection");
  const locale = useLocale();
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

  /**
   * Where each month begins, as a % across the window. 100 days of colour say
   * nothing about WHEN, and months are the unit the household already reads
   * dates in — so the strip carries them itself (see the line below).
   *
   * A month opening in the last sliver of the window is skipped: naming a
   * segment three days wide crowds the one before it for nothing (user, 260812).
   */
  const monthMarks = useMemo(() => {
    if (!data || data.days.length === 0) return [];
    const span = Math.max(data.days.length - 1, 1);
    const monthName = (iso: string) =>
      new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" })
        .format(new Date(`${iso}T00:00:00Z`))
        .replace(/\.$/, "");
    return data.days.flatMap((d, i) => {
      const opensAMonth = i === 0 || d.date.endsWith("-01");
      if (!opensAMonth) return [];
      const pct = (i / span) * 100;
      // …and it must have room to be worth printing.
      if (i > 0 && pct > 92) return [];
      return [{ key: d.date, pct, label: monthName(d.date) }];
    });
  }, [data, locale]);

  const headline = useMemo(() => {
    if (!data) return "";
    // Only RED days count as a problem; yellow (dipping into reserve) is fine.
    const firstRed = data.summary.first_red_date;
    return firstRed
      ? t("mightRunShort", { date: formatDayMonth(firstRed, locale) })
      : t("allFine");
  }, [data, t, locale]);

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
      <h3 className="mb-2.5 truncate text-caption text-[var(--muted-foreground)]">
        {t("title")}
      </h3>

      <div
        data-testid="projection-band"
        // 20px strip + the income row under it. It was 44px so the ▼ markers had
        // somewhere to sit ABOVE the line; they are notches inside the strip
        // now, and the empty half read as a gap under the title (user, 260812).
        className="relative h-9 touch-none select-none"
        onPointerLeave={() => setActive(null)}
        onPointerMove={(e) => selectFromClientX(e.clientX, e.currentTarget)}
        onPointerDown={(e) => selectFromClientX(e.clientX, e.currentTarget)}
      >
        {/* Fluent colour line — and the calendar itself. The months live INSIDE
            it: a divider where each turns, its name in the segment that follows,
            in the same dark ink the brand uses on top of a colour. A row of
            labels under the bar read as a separate chart; here the strip simply
            IS the three months (user, 260812). Tall enough (20px) to hold 10px
            text without crowding it, and clipped by its own rounded ends. */}
        <div
          data-testid="projection-line"
          className="absolute inset-x-0 top-0 h-5 overflow-hidden rounded-full"
          style={{ background: gradient }}
        >
          {/* Every mark on the band in ONE svg, drawn with crispEdges.
              As HTML boxes these were antialiased: a 1.5px line at a fractional
              x is spread over two device pixels, so identical notches rendered
              as "two wide ones and a narrow one" (user, 260812). crispEdges
              makes the browser snap each rect to the pixel grid instead — every
              mark comes out the same, at the cost of up to half a pixel of
              position, which on a 100-day strip is a couple of hours.
              A month turns from the TOP, a payment rises from the BOTTOM, so
              the two never share a band and can't be read as one language. */}
          <svg
            data-testid="projection-marks"
            aria-hidden="true"
            shapeRendering="crispEdges"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full"
          >
            {monthMarks.slice(1).map((m) => (
              // A month turns: DASHED, down the whole strip. Solid, it was the
              // heaviest mark on the band and got read as a huge payment; short,
              // it was just another tick among the notches. Dashed says
              // "boundary" in a language no payment speaks (user, 260812).
              <line
                key={`rule-${m.key}`}
                data-testid="projection-month-rule"
                x1={`${m.pct}%`}
                x2={`${m.pct}%`}
                y1="0"
                y2="100%"
                stroke="var(--forecast-rule)"
                strokeWidth="1"
                strokeDasharray="3 2"
              />
            ))}
            {data.bill_points.map((b, i) => {
              const pct = pctFor(b.date);
              if (pct === null) return null;
              return (
                <rect
                  key={`bill-${i}`}
                  data-testid="projection-bill-marker"
                  x={`${pct}%`}
                  // 20px strip, 5px notch — sits on the bottom edge.
                  y="15"
                  // ONE whole CSS pixel: 1.5px is 4.5 device pixels on a phone,
                  // which snapped to 4 or 5 depending on where the day fell —
                  // the same payment rendering wider or narrower than its
                  // neighbour (user, 260812). An integer width divides evenly at
                  // every device ratio, so every mark is identical.
                  width="1"
                  height="5"
                  // …centred on its day, and never clipped at the far end.
                  transform="translate(-0.5)"
                  fill="var(--forecast-notch)"
                />
              );
            })}
          </svg>

          {monthMarks.map((m, i) => (
            <span
              key={m.key}
              data-testid="projection-month"
              aria-hidden="true"
              className="absolute top-1/2 -translate-y-1/2 whitespace-nowrap text-[10px] font-medium leading-none"
              style={{
                left: `${m.pct}%`,
                // Clear of the rounded end on the left, of the divider elsewhere.
                marginLeft: i === 0 ? "8px" : "5px",
                color: "var(--forecast-ink)",
              }}
            >
              {m.label}
            </span>
          ))}
        </div>

        {/* Income (money IN): a green dot under the band. It was a literal "$",
            which a złoty or hryvnia budget got too; a dot says "money lands
            here" in every currency and the tooltip carries the amount (user
            picked it from the mockups, 260812). Below the band rather than
            inside it, so income reads as arriving AT the line while payments
            are cut OUT of it. */}
        {data.income_points.map((p, i) => {
          const pct = pctFor(p.date);
          if (pct === null) return null;
          return (
            <span
              key={`inc-${i}`}
              data-testid="projection-income-marker"
              aria-hidden
              className="absolute z-[2] size-[5px] -translate-x-1/2 rounded-full"
              style={{
                left: `${pct}%`,
                top: "24px",
                background: "var(--trading-up)",
              }}
            />
          );
        })}

        {/* Scrubber cursor. */}
        {active !== null && (
          <span
            aria-hidden
            className="absolute z-[2] h-6 w-0.5 -translate-x-1/2 rounded bg-[var(--body-on-dark)]"
            style={{ left: `${activePct}%`, top: "-2px" }}
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
            // Pending occurrences have dates in the PAST, so no day cell would
            // ever match them. They belong to today — the first cell — which is
            // where they drift to until they are answered.
            pending={active === 0 ? (data.pending_points ?? []) : []}
            leftPct={activePct}
            currency={data.currency}
            locale={locale}
            t={t}
            amountPrivacyEnabled={amountPrivacyEnabled}
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

/** One term of the day's arithmetic: sign + label on the left, amount right.
 *  The SIGN carries the colour — green adds, red takes away — so the direction
 *  reads down the column at a glance and the figures stay one uniform ink
 *  (colouring the amounts made income the only loud number, user 260812). */
function LedgerRow({
  sign,
  label,
  amount,
  testId,
}: {
  sign?: "+" | "−";
  label: string;
  amount: React.ReactNode;
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className="flex items-baseline justify-between gap-3"
    >
      <span className="flex min-w-0 items-baseline gap-1 text-[var(--muted-foreground)]">
        {sign && (
          <span
            aria-hidden="true"
            className="shrink-0 font-semibold"
            style={{
              color: sign === "+" ? "var(--trading-up)" : "var(--trading-down)",
            }}
          >
            {sign}
          </span>
        )}
        <span className="min-w-0 truncate">{label}</span>
      </span>
      <span className="shrink-0 tabular-nums text-[var(--body-on-dark)]">
        {amount}
      </span>
    </div>
  );
}

function ProjectionTooltip({
  day,
  bills,
  incomes,
  pending,
  leftPct,
  currency,
  locale,
  t,
  amountPrivacyEnabled,
}: {
  day: ProjectionDay;
  bills: { name: string; category_id: string | null; amount_cents: string }[];
  incomes: { name: string; amount_cents: string }[];
  /** Unconfirmed occurrences, shown on the first (today) cell only — see below. */
  pending: { date: string; name: string; amount_cents: string }[];
  leftPct: number;
  currency: string;
  locale: string;
  t: ReturnType<typeof useTranslations>;
  amountPrivacyEnabled: boolean;
}) {
  const money = (c: string) => {
    const s = centsToDisplayCompact(roundToUnit(c), currency, "en", true);
    return amountPrivacyEnabled ? <SlotAmount value={s} /> : s;
  };
  const available = Number(day.available_cents);
  // Anchor the tooltip so it never clips the card edge: pin its LEFT edge to the
  // cursor near the start, its RIGHT edge near the end, else centre it.
  const shiftPct = leftPct < 22 ? 0 : leftPct > 78 ? -100 : -50;
  const dot =
    day.color === "red"
      ? "var(--trading-down)"
      : day.color === "yellow"
        ? "var(--primary)"
        : "var(--trading-up)";

  // Grouped rows, in reading order: money in, money out, reserve used, uncovered.
  const sections = [
    {
      label: t("income"),
      color: "var(--trading-up)",
      rows: incomes.map((p, i) => ({
        key: `i${i}`,
        name: p.name || t("income"),
        amount: p.amount_cents,
      })),
    },
    {
      label: t("bill"),
      color: "var(--muted-foreground)",
      rows: bills.map((b, i) => ({
        key: `b${i}`,
        name: b.name || t("bill"),
        amount: b.amount_cents,
      })),
    },
    {
      label: t("reserveUsed"),
      color: "var(--primary)",
      rows: day.drew_reserve.map((r, i) => ({
        key: `d${i}`,
        name: r.name || t("bill"),
        amount: r.amount_cents,
      })),
    },
    {
      label: t("cantCover"),
      color: "var(--trading-down)",
      rows: day.shortfall.map((s, i) => ({
        key: `s${i}`,
        name: s.name || t("bill"),
        amount: s.amount_cents,
      })),
    },
  ].filter((s) => s.rows.length > 0);

  return (
    <div
      data-testid="projection-tooltip"
      // ABOVE the line (bottom-full) so a finger never covers it; follows the
      // active day's x, edge-anchored so it never clips out of the card.
      style={{ left: `${leftPct}%`, transform: `translateX(${shiftPct}%)` }}
      className="pointer-events-none absolute bottom-full z-10 mb-2 w-max min-w-[168px] max-w-[264px] rounded-[var(--radius-md)] border border-[var(--hairline-dark)] bg-[var(--surface-card-dark)] p-3 text-xs shadow-lg"
    >
      {/* Header: status dot + date */}
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="size-2 shrink-0 rounded-full"
          style={{ background: dot }}
        />
        <span className="font-medium text-[var(--body-on-dark)]">
          {formatShortDate(day.date, locale)}
        </span>
      </div>

      {/* The day as ONE subtraction. The line's first cell sits a day's burn
          below the "available to spend" card, which reads as a mismatch until
          the arithmetic is spelled out (user, 260812):
            start of day  + income − scheduled − planned spend
            (+ whatever the reserve covered, which never touches cash) = left */}
      <div className="mt-2 space-y-px">
        <LedgerRow
          label={t("opening")}
          amount={money(day.opening_cents)}
          testId="projection-opening"
        />
        {Number(day.income_cents) > 0 && (
          <LedgerRow
            sign="+"
            label={t("income")}
            amount={money(day.income_cents)}
            testId="projection-income-term"
          />
        )}
        {Number(day.bill_cents) > 0 && (
          <LedgerRow
            sign="−"
            label={t("bill")}
            amount={money(day.bill_cents)}
            testId="projection-bill-total"
          />
        )}
        {Number(day.planned_burn_cents) > 0 && (
          <LedgerRow
            sign="−"
            label={t("plannedSpend")}
            amount={money(day.planned_burn_cents)}
            testId="projection-planned-burn"
          />
        )}
        {Number(day.reserve_covered_cents) > 0 && (
          <LedgerRow
            sign="+"
            label={t("reserveUsed")}
            amount={money(day.reserve_covered_cents)}
            testId="projection-reserve-term"
          />
        )}
      </div>

      {/* …and the result of it. */}
      <div className="mt-1.5 flex items-baseline justify-between gap-4 border-t border-[var(--hairline-dark)] pt-1.5">
        <span className="text-[var(--muted-foreground)]">{t("left")}</span>
        <span
          data-testid="projection-left"
          className="shrink-0 text-sm font-semibold tabular-nums"
          style={{
            color:
              available < 0 ? "var(--trading-down)" : "var(--body-on-dark)",
          }}
        >
          {money(day.available_cents)}
        </span>
      </div>

      {/* Occurrences whose date passed with no answer. Their money is already
          inside the daily planned spend above — this section only says so, and
          keeps saying it every day until the payment is confirmed or rejected
          (user, 260812). Anchored to the first cell, which is today. */}
      {pending.length > 0 && (
        <div className="mt-2 border-t border-[var(--hairline-dark)] pt-2">
          <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--muted-foreground)]">
            {t("pending")}
          </div>
          {pending.map((p, i) => (
            <div
              key={`p${i}`}
              data-testid="projection-pending-row"
              className="flex items-baseline justify-between gap-3 py-px"
            >
              <span className="min-w-0 truncate text-[var(--body-on-dark)]">
                {p.name || t("bill")}{" "}
                <span className="text-[var(--muted-foreground)]">
                  · {formatShortDate(p.date, locale)}
                </span>
              </span>
              <span className="shrink-0 tabular-nums text-[var(--muted-foreground)]">
                {money(p.amount_cents)}
              </span>
            </div>
          ))}
          <div className="mt-1 text-[10px] leading-snug text-[var(--muted-foreground)]">
            {t("pendingHint")}
          </div>
        </div>
      )}

      {sections.map((sec) => (
        <div
          key={sec.label}
          className="mt-2 border-t border-[var(--hairline-dark)] pt-2"
        >
          <div
            className="mb-1 text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: sec.color }}
          >
            {sec.label}
          </div>
          {sec.rows.map((r) => (
            <div
              key={r.key}
              className="flex items-baseline justify-between gap-3 py-px"
            >
              <span className="min-w-0 truncate text-[var(--body-on-dark)]">
                {r.name}
              </span>
              <span className="shrink-0 tabular-nums text-[var(--muted-foreground)]">
                {money(r.amount)}
              </span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
