"use client";
/**
 * overview-sections.tsx — owns the shared Overview range state and composes the
 * range selector + the four collapsible sections in spec order (Planned ·
 * Overspent · Reserves · Financial Wealth, 11-09 / DD-4). Range-scoped sections
 * receive `range`; the recurring + reserves bars ignore it (handled inside).
 */
import { useState } from "react";
import { RangeSelector } from "./range-selector";
import { PlannedSection } from "./planned-section";
import { OverspentReservesSection } from "./overspent-reserves-section";
import { WealthSection } from "./wealth-section";
import {
  makeRange,
  DEFAULT_RANGE_PRESET,
  type OverviewRange,
} from "@/lib/overview-range";

export function OverviewSections({ budgetId }: { budgetId: string }) {
  const [range, setRange] = useState<OverviewRange>(() =>
    makeRange(DEFAULT_RANGE_PRESET),
  );

  return (
    <div className="flex flex-col gap-3" data-testid="overview-sections">
      <RangeSelector value={range} onChange={setRange} />
      <PlannedSection budgetId={budgetId} range={range} />
      <OverspentReservesSection budgetId={budgetId} range={range} />
      <WealthSection budgetId={budgetId} range={range} />
    </div>
  );
}
