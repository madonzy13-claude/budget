"use client";
/**
 * overview-sections.tsx — owns the shared Overview range + the four collapsible
 * sections (Planned · Overspent · Reserves · Financial Wealth).
 *
 * The range sits IN-FLOW between the cash-flow projection and the Planned section
 * and pins to the top via StickOnScroll (fixed-when-scrolled-past, drops back to
 * its slot when scrolled up) — NOT `position: sticky`. A real sticky here is a
 * second sticky in the page scroll (under the header + pills band) and makes iOS
 * Safari paint its floating bottom bar solid black; `fixed` doesn't. See
 * stick-on-scroll.tsx.
 */
import { useState } from "react";
import { RangeSelector } from "./range-selector";
import { PlannedSection } from "./planned-section";
import { OverspentReservesSection } from "./overspent-reserves-section";
import { WealthSection } from "./wealth-section";
import { StickOnScroll } from "@/components/common/stick-on-scroll";
import { useBdpUiStore } from "@/components/budgeting/bdp-ui-state";
import { useUserTimezone } from "@/components/common/user-timezone-provider";
import {
  makeRange,
  DEFAULT_RANGE_PRESET,
  type OverviewRange,
} from "@/lib/overview-range";

export function OverviewSections({
  budgetId,
  reservesEnabled = true,
  investmentsEnabled = true,
  amountPrivacyEnabled = true,
}: {
  budgetId: string;
  reservesEnabled?: boolean;
  investmentsEnabled?: boolean;
  amountPrivacyEnabled?: boolean;
}) {
  // Range persists across pill navigation via the BDP store (item 4): seed from
  // it on mount, write back on every change.
  const store = useBdpUiStore();
  // Current-month default rolls over in the user's timezone, not UTC (r31 item 1).
  const tz = useUserTimezone();
  const [range, setRange] = useState<OverviewRange>(
    () => store?.overview.range ?? makeRange(DEFAULT_RANGE_PRESET, tz),
  );
  const applyRange = (r: OverviewRange) => {
    if (store) store.overview.range = r;
    setRange(r);
  };

  return (
    <div className="flex flex-col gap-3" data-testid="overview-sections">
      <StickOnScroll
        className="bg-[var(--canvas-dark)] py-2"
        pinnedClassName="border-b border-[var(--hairline-dark)]"
      >
        <RangeSelector value={range} onChange={applyRange} />
      </StickOnScroll>
      <PlannedSection
        budgetId={budgetId}
        range={range}
        amountPrivacyEnabled={amountPrivacyEnabled}
      />
      <OverspentReservesSection
        budgetId={budgetId}
        range={range}
        reservesEnabled={reservesEnabled}
        amountPrivacyEnabled={amountPrivacyEnabled}
      />
      <WealthSection
        budgetId={budgetId}
        range={range}
        investmentsEnabled={investmentsEnabled}
        amountPrivacyEnabled={amountPrivacyEnabled}
      />
    </div>
  );
}
