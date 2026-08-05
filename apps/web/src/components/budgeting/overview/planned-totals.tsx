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
import { useTranslations } from "next-intl";
import { SlotAmount } from "@/components/budgeting/overview/slot-amount";
import { CombinedStat } from "@/components/budgeting/overview/combined-stat";
import { varianceColor } from "@/components/budgeting/charts/diverging-bar-chart";
import { ShareBar } from "@/components/budgeting/overview/share-bar";

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
}

function Figure({ cell, mask }: { cell: Cell; mask: boolean }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-0.5 text-center">
      <p className="text-caption text-[var(--muted-foreground)]">
        {cell.label}
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
}) {
  const t = useTranslations("bdp.tab.overview");
  const n = (v: string) => BigInt(v || "0");

  const planned = n(plannedCents);
  const spent = n(spentCents);
  const diff = spent - planned;
  // Under plan reads negative and green, over reads positive and red — the same
  // sign and colour the "How far off plan" bars use.
  const pct = planned > 0n ? (Number(diff) / Number(planned)) * 100 : null;
  const sign = diff > 0n ? "+" : diff < 0n ? "−" : "";
  const absDiff = diff < 0n ? -diff : diff;

  const comparison: Cell[] = [
    { key: "spent", label: t("planned.totalSpent"), value: format(spent) },
    {
      key: "planned",
      label: t("planned.totalPlanned"),
      value: format(planned),
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
      <div className="grid grid-cols-3 items-start gap-x-3 gap-y-1 border-t border-[var(--hairline-dark)] pt-2">
        {comparison.map((c) => (
          <Figure key={c.key} cell={c} mask={maskValue} />
        ))}
        <CombinedStat
          testId="planned-total-difference"
          label={t("planned.difference")}
          pct={pct}
          amount={`${sign}${format(absDiff)}`}
          mask={maskValue}
          // Only while the range is this month alone: five days in, being under
          // says nothing. Reach back further and the colour returns (260803).
          tone={rangeWithinRunningMonth ? "plain" : "auto"}
          // Banded by DISTANCE from plan, the same green/yellow/red the
          // by-category bars use — 5% under is not a triumph, and 50% under is
          // as much a planning miss as 50% over.
          color={pct === null ? undefined : varianceColor(pct)}
        />
      </div>
    </div>
  );
}
