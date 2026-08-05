"use client";
/**
 * overview-sections.tsx — owns the shared Overview range + the four collapsible
 * sections (Planned · Recurring payments · Reserves · Financial Wealth).
 *
 * 260803: Overspent lost its own collapsible and reads inside Planned, and the
 * two recurring charts left Planned for a section of their own.
 *
 * The range sits IN-FLOW between the cash-flow projection and the Planned section
 * and pins to the top via StickOnScroll (fixed-when-scrolled-past, drops back to
 * its slot when scrolled up) — NOT `position: sticky`. A real sticky here is a
 * second sticky in the page scroll (under the header + pills band) and makes iOS
 * Safari paint its floating bottom bar solid black; `fixed` doesn't. See
 * stick-on-scroll.tsx.
 */
import { useEffect, useState } from "react";
import { RangeSelector } from "./range-selector";
import { useMemberUiPrefs } from "@/hooks/use-member-ui-prefs";
import {
  decodeRangePref,
  encodeRangePref,
  RANGE_PREF_KEY,
} from "@/lib/range-pref";
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
  // …and across DEVICES, per member (260805 request): the pick rides the member
  // row, so the phone and the desktop agree while another member of the same
  // budget still opens on their own. The BDP store still wins within a visit —
  // it holds the range you were just looking at, including one you arrived at
  // by stepping a period back.
  const { prefs, isLoaded, save } = useMemberUiPrefs(budgetId);
  const [range, setRange] = useState<OverviewRange | null>(
    () => store?.overview.range ?? null,
  );
  useEffect(() => {
    if (range !== null || !isLoaded) return;
    setRange(
      decodeRangePref(prefs[RANGE_PREF_KEY], tz) ??
        makeRange(DEFAULT_RANGE_PRESET, tz),
    );
  }, [range, isLoaded, prefs, tz]);

  const applyRange = (r: OverviewRange) => {
    if (store) store.overview.range = r;
    setRange(r);
    void save(RANGE_PREF_KEY, encodeRangePref(r));
  };

  // Nothing is drawn until the stored pick lands: seeding early would show the
  // default range, fetch a month of data for it, and then swap — a visible
  // flash and a wasted request (mirrors the category pickers' own wait).
  if (range === null) return null;

  return (
    <div className="flex flex-col gap-3" data-testid="overview-sections">
      <StickOnScroll
        className="bg-[var(--canvas-dark)] py-2"
        pinnedClassName="border-b border-[var(--hairline-dark)]"
      >
        <RangeSelector value={range} onChange={applyRange} />
      </StickOnScroll>
      {/* No amountPrivacyEnabled: the planned figures stay readable while the
          rest of the page is redacted (user, 260803). */}
      <PlannedSection budgetId={budgetId} range={range} />
      <OverspentReservesSection
        budgetId={budgetId}
        range={range}
        reservesEnabled={reservesEnabled}
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
