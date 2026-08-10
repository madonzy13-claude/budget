"use client";
/**
 * planned-totals.tsx — the figures under the timeline's picker (260803).
 *
 * Two tiers, because they answer two questions.
 *
 *   Planned spent · Used reserves · Overspent   — the BREAKDOWN of what was
 *     spent, in the same green / yellow / red the line below is drawn in, so
 *     the row reads as that chart's key. The three sum to Total spent.
 *
 *   Total spent · Total planned · Difference     — the COMPARISON, which is a
 *     different question and gets its own line, under a hairline.
 *
 * A 3-column grid rather than a wrapping flex row: six figures that wrap
 * raggedly stop looking like a table of numbers and start looking like a mess.
 * Two tidy rows of three hold on a phone and stay aligned down the columns.
 *
 * They sit under the category picker on purpose — both sides are filtered by
 * it, so the thing that narrows them is directly above.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { SlotAmount } from "@/components/budgeting/overview/slot-amount";
import { CombinedStat } from "@/components/budgeting/overview/combined-stat";
import { plannedGapColor } from "@/components/budgeting/charts/diverging-bar-chart";
import { ShareBar } from "@/components/budgeting/overview/share-bar";
import { labelSpan } from "@/lib/label-span";

/** Matches the plan-zone line: limit-covered green, reserve yellow, over red. */
const ZONE = {
  within: "var(--trading-up)",
  reserve: "var(--primary)",
  over: "var(--trading-down)",
} as const;

interface Cell {
  key: string;
  label: string;
  value: string;
  tone?: string;
  /** Trails the figure, one size down — the percent beside the amount. */
  suffix?: string;
  /** What the total comes to in a month, under it. Absent for a one-month
   *  range, where it would only repeat the figure above (260805). */
  perMonth?: string;
}

/** The monthly figure under a range total. "⌀" rather than a word: it sits in a
 *  111px column on a phone, and a screen reader gets the label instead. */
function PerMonth({
  testId,
  value,
  label,
}: {
  testId: string;
  value: string;
  label: string;
}) {
  return (
    <span
      data-testid={testId}
      aria-label={`${label}: ${value}`}
      className="num text-caption whitespace-nowrap text-[var(--muted-foreground)]"
    >
      <span aria-hidden>⌀ </span>
      {value}
    </span>
  );
}

function Figure({
  cell,
  mask,
  perMonthLabel,
  labelRef,
}: {
  cell: Cell;
  mask: boolean;
  perMonthLabel: string;
  labelRef?: React.Ref<HTMLSpanElement>;
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 text-center">
      <p className="text-caption text-[var(--muted-foreground)]">
        {/* Inline, so a measurement of it is the width of the WORDS rather than
            of the column they are centred in (260805). */}
        <span ref={labelRef}>{cell.label}</span>
      </p>
      {/* nowrap: at 390px the cell is ~111px and "−3,698 zł · −13%" wanted ~112,
          so the percent dropped to a second line (user screenshot). Set one size
          down it fits, and reads as the qualifier it is. */}
      <span
        className="num text-num-sm whitespace-nowrap"
        style={cell.tone ? { color: cell.tone } : undefined}
        data-testid={`planned-total-${cell.key}`}
      >
        {mask ? <SlotAmount value={cell.value} /> : cell.value}
        {cell.suffix && (
          <span className="text-caption ml-1">{cell.suffix}</span>
        )}
      </span>
      {cell.perMonth ? (
        <PerMonth
          testId={`planned-total-${cell.key}-avg`}
          value={cell.perMonth}
          label={perMonthLabel}
        />
      ) : (
        // The gap always carries its amount on a third line, so without this the
        // two totals stood two lines tall and it stood three — the column hung
        // below the row whenever the range was a single month (user, 260805).
        <span aria-hidden className="text-caption">
          &nbsp;
        </span>
      )}
    </div>
  );
}

export function PlannedTotals({
  plannedCents,
  spentCents,
  withinLimitCents,
  reserveUsedCents,
  overspentCents,
  format,
  maskValue = false,
  reservesEnabled = true,
  rangeWithinRunningMonth = false,
  months = 1,
}: {
  plannedCents: string;
  spentCents: string;
  withinLimitCents: string;
  reserveUsedCents: string;
  overspentCents: string;
  format: (cents: bigint) => string;
  maskValue?: boolean;
  /** Reserves off → that figure is always zero, so it is dropped. */
  reservesEnabled?: boolean;
  /** The whole range sits inside the month still running — the gap is not a
   *  verdict yet, so it reads plain. A range reaching further back is mostly
   *  finished history and keeps its colour (260803 user decision). */
  rangeWithinRunningMonth?: boolean;
  /** Calendar months the range covers — the divisor for the monthly figures.
   *  1 means there is nothing to average and they are dropped (260805). */
  months?: number;
}) {
  const t = useTranslations("bdp.tab.overview");
  const n = (v: string) => BigInt(v || "0");

  // The bar reads as this row's key, so it spans the row's WORDS: from where
  // "Total spent" begins to where "Under plan" ends (user, 260805). Measured,
  // because the columns are equal and the labels are not — and the labels change
  // with the locale.
  const rowRef = useRef<HTMLDivElement>(null);
  const firstLabelRef = useRef<HTMLSpanElement>(null);
  const lastLabelRef = useRef<HTMLSpanElement>(null);
  const [inset, setInset] = useState({ left: 0, right: 0 });
  const measure = useCallback(() => {
    const row = rowRef.current;
    const first = firstLabelRef.current;
    const last = lastLabelRef.current;
    if (!row || !first || !last) return;
    const next = labelSpan(
      row.getBoundingClientRect(),
      first.getBoundingClientRect(),
      last.getBoundingClientRect(),
    );
    setInset((cur) =>
      cur.left === next.left && cur.right === next.right ? cur : next,
    );
  }, []);
  useEffect(() => {
    measure();
    // A resize listener as well as the observer: a font swap or a locale change
    // moves the words without resizing the row that holds them.
    window.addEventListener("resize", measure);
    const ro =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(measure);
    if (ro && rowRef.current) ro.observe(rowRef.current);
    return () => {
      window.removeEventListener("resize", measure);
      ro?.disconnect();
    };
  });

  const planned = n(plannedCents);
  const spent = n(spentCents);
  const diff = spent - planned;
  // Under plan reads negative and green, over reads positive and red — the same
  // sign and colour the "How far off plan" bars use.
  const pct = planned > 0n ? (Number(diff) / Number(planned)) * 100 : null;
  const sign = diff > 0n ? "+" : diff < 0n ? "−" : "";
  const absDiff = diff < 0n ? -diff : diff;

  // The averages live here now, under the totals they are averages OF — under
  // the by-category bars they asked the same three questions a second time
  // (user, 260805). Range totals over calendar months, so all three figures
  // come from one source and cannot disagree.
  // `months` can be FRACTIONAL now: the month still running counts as the days
  // it has actually had (user, 260810), so this cannot be integer division —
  // BigInt(1.32) throws outright. Round to the cent and hand back a bigint.
  const perMonth = (v: bigint) => BigInt(Math.round(Number(v) / months));
  const per = (v: bigint) => (months > 1 ? format(perMonth(v)) : undefined);

  const comparison: Cell[] = [
    {
      key: "spent",
      label: t("planned.totalSpent"),
      value: format(spent),
      perMonth: per(spent),
    },
    {
      key: "planned",
      label: t("planned.totalPlanned"),
      value: format(planned),
      perMonth: per(planned),
    },
  ];

  return (
    <div
      data-testid="planned-totals"
      // The section stacks its children 8px apart, which wedged these figures
      // against the picker above and the chart below — a solid pill on one side
      // and open chart on the other read as unequal even though both gaps
      // measured 8px (user report, 260803). Their own margin sets them apart as
      // a group, equally on both sides.
      className="my-2 flex flex-col gap-2"
    >
      {/* The breakdown is a BAR now (user, 260804): three figures in a row said
          the same thing, but the shape shows a sliver of red without anyone
          reading a number. The caption carries the amount on hover or tap. */}
      <ShareBar
        testId="planned-breakdown"
        insetLeft={inset.left}
        insetRight={inset.right}
        months={months}
        perMonthLabel={t("planned.perMonth")}
        segments={[
          {
            key: "within",
            label: t("planned.fromPlan"),
            value: Number(withinLimitCents),
            color: ZONE.within,
          },
          {
            key: "reserve",
            label: t("planned.fromReserve"),
            // A budget with reserves switched off has no such piece, whatever
            // the payload says (the flag hid the old figure the same way).
            value: reservesEnabled ? Number(reserveUsedCents) : 0,
            color: ZONE.reserve,
          },
          {
            key: "overspent",
            label: t("planned.overspent"),
            value: Number(overspentCents),
            color: ZONE.over,
          },
        ]}
        format={(v: number) => format(BigInt(Math.round(v)))}
      />
      {/* The two totals sit level with the difference's own label, so the three
          read across as one line of figures. */}
      {/* No rule above them: the bar is already a boundary, and a hairline under
          it cut the block in two where nothing needed separating (user,
          260805). */}
      <div
        ref={rowRef}
        className="grid grid-cols-3 items-start gap-x-3 gap-y-1 pt-1"
      >
        {comparison.map((c, i) => (
          <Figure
            key={c.key}
            cell={c}
            mask={maskValue}
            perMonthLabel={t("planned.perMonth")}
            labelRef={i === 0 ? firstLabelRef : undefined}
          />
        ))}
        <CombinedStat
          testId="planned-total-difference"
          // The label names the direction rather than leaving the reader to work
          // it out from a sign (user, 260805); a dead heat is neither.
          label={t(
            diff > 0n
              ? "planned.overPlan"
              : diff < 0n
                ? "planned.underPlan"
                : "planned.difference",
          )}
          // Level with the two totals beside it: leading a size up made this
          // column taller than the row (user, 260805).
          size="sm"
          labelRef={lastLabelRef}
          pct={pct}
          // The AMOUNT is monthly like its neighbours; the percent is a ratio,
          // identical either way, so it stays as it was (user, 260805).
          amount={`${sign}${format(months > 1 ? perMonth(absDiff) : absDiff)}`}
          mask={maskValue}
          // Only while the range is this month alone: five days in, being under
          // says nothing. Reach back further and the colour returns (260803).
          tone={rangeWithinRunningMonth ? "plain" : "auto"}
          // Under plan is money kept (green) until the plan is 30% adrift and
          // reads as wrong (yellow); over is red at any size. Deliberately NOT
          // the by-category bands: that chart asks how well each category was
          // planned, this figure asks whether the budget held (user, 260805).
          color={pct === null ? undefined : plannedGapColor(pct)}
        />
      </div>
    </div>
  );
}
