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
  plannedIsPartial = false,
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
  /** The plan covers only part of a month at one end — a forecast, not a budget. */
  plannedIsPartial?: boolean;
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

  const breakdown: Cell[] = [
    {
      key: "within",
      label: t("planned.fromPlan"),
      value: format(n(withinLimitCents)),
      // Green says "this went well"; zero has nothing to say (260803 request).
      tone: n(withinLimitCents) > 0n ? ZONE.within : undefined,
    },
    ...(reservesEnabled
      ? [
          {
            key: "reserve",
            label: t("planned.fromReserve"),
            value: format(n(reserveUsedCents)),
            tone: n(reserveUsedCents) > 0n ? ZONE.reserve : undefined,
          },
        ]
      : []),
    {
      key: "overspent",
      label: t("planned.overspent"),
      value: format(n(overspentCents)),
      tone: n(overspentCents) > 0n ? ZONE.over : undefined,
    },
  ];

  const comparison: Cell[] = [
    { key: "spent", label: t("planned.totalSpent"), value: format(spent) },
    {
      key: "planned",
      label: t("planned.totalPlanned"),
      value: format(planned),
    },
  ];

  return (
    <div data-testid="planned-totals" className="flex flex-col gap-2">
      <div className="grid grid-cols-3 gap-x-3 gap-y-1">
        {breakdown.map((c) => (
          <Figure key={c.key} cell={c} mask={maskValue} />
        ))}
      </div>
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
          // A part-month plan is a forecast to today, so being under it is not
          // yet a verdict — it reads plain rather than green or red (260803).
          tone={plannedIsPartial ? "plain" : "auto"}
        />
      </div>
    </div>
  );
}
