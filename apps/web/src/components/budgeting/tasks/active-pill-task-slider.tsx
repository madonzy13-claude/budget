"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { PillTaskSlider } from "@/components/budgeting/tasks/pill-task-slider";
import type { TaskSummary } from "@/components/budgeting/task-banner-row";
import type { Pill } from "@/components/budgeting/tasks/kind-pill-map";

/**
 * ActivePillTaskSlider — renders the active tab's PillTaskSlider INSIDE the
 * [data-bdp-tabs] sticky band (quick-260612-a0c R2).
 *
 * Why here and not in the tab pages: the banner used to be rendered by each
 * tab page, i.e. as in-flow page content BELOW the sticky band. In browser
 * mode the [data-shell-header] is pinned (sticky top:0) and the band sticks
 * at top:calc(4rem + 1px) — so on native page scroll the banner slid under
 * both and was occluded. Inside the band it inherits the band's sticky offset
 * + z-40 and stays visible below the pinned header in BOTH display modes
 * (this was also the original Plan 03-06 design: "single sticky wrapper
 * holding the optional task banner + pill tabs row").
 *
 * The BDP layout is a server component and cannot read the active tab or
 * searchParams, hence this small client shim: active pill from usePathname()
 * (same prefix match as BdpTabs), deep-link focus task from ?task= (same
 * param the tab pages previously forwarded — D-PH7-30 / PWAX-06).
 *
 * key={pill} remounts the slider per tab so the always-start-collapsed and
 * deep-link auto-expand mount semantics are preserved on tab switches.
 */

const PILLS: readonly Pill[] = ["wallets", "spendings", "reserves", "settings"];

interface ActivePillTaskSliderProps {
  budgetId: string;
  locale: string;
  initialTasks: TaskSummary[];
}

export function ActivePillTaskSlider({
  budgetId,
  locale,
  initialTasks,
}: ActivePillTaskSliderProps) {
  const pathname = usePathname() ?? "";
  const searchParams = useSearchParams();

  const base = `/${locale}/budgets/${budgetId}/`;
  const pill = PILLS.find((p) => pathname.startsWith(`${base}${p}`));
  if (!pill) return null;

  const focusTaskId = searchParams?.get("task") ?? undefined;

  return (
    <PillTaskSlider
      key={pill}
      budgetId={budgetId}
      locale={locale}
      pill={pill}
      initialTasks={initialTasks}
      focusTaskId={focusTaskId}
    />
  );
}
