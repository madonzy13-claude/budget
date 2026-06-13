import { Suspense } from "react";
import { BudgetShellData } from "./budget-shell-data";

/**
 * BDP layout (Plan 03-06 BDP-01) — single sticky wrapper at top:64px holding
 * the pill tabs row, then `{children}` (tab content).
 *
 * Z-stack (locked across phases):
 *   - top-nav header z-50 (Plan 03-04)
 *   - BDP sticky wrapper z-40 (rendered by BudgetShellData)
 *   - BudgetSwitcher PopoverContent z-[60] (Plan 03-04 — must sit above both)
 *
 * quick-260613-pdb (Issue 3, Option A): NON-SUSPENDING refactor. The layout
 * no longer top-level-awaits any serverApiFetch — all awaited data (membership
 * gate, reservesEnabled, initialTasks) moved into <BudgetShellData> behind a
 * <Suspense fallback={null}>. WHY: when the layout itself suspended it tripped
 * the generic budgets/[id]/loading.tsx skeleton, then the page suspended and
 * tripped the tab's loading.tsx → TWO skeletons. With the layout committing
 * synchronously and budgets/[id]/loading.tsx deleted, only the child tab's
 * own loading.tsx shows = single skeleton. The membership gate, reservesEnabled
 * cascading-hide, tasks banner/badges, and ?task= deep-link all live unchanged
 * inside BudgetShellData (redirect() throws before any return → gate still runs
 * before BdpTabs commits).
 *
 * quick-260612-cdu R2: ActivePillTaskSlider lives inside BudgetShellData as
 * normal page content below the band. pb-shell-safe (standalone-only bottom
 * clearance INSIDE page content — the only placement iOS WebKit honors, see
 * global.css) wraps `{children}` so the page slot's own loading.tsx renders
 * inside the correct bottom-clearance wrapper.
 */

interface BdpLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string; id: string }>;
}

export default async function BdpLayout({ children, params }: BdpLayoutProps) {
  // params await is cheap and does NOT gate on the network — the layout still
  // commits synchronously w.r.t. data fetches (those live in BudgetShellData).
  const { locale, id } = await params;

  return (
    <>
      <Suspense fallback={null}>
        <BudgetShellData locale={locale} id={id} />
      </Suspense>
      <div className="pb-shell-safe">{children}</div>
    </>
  );
}
