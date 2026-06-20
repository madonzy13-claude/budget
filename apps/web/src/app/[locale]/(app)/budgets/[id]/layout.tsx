import { Suspense } from "react";
import { BudgetShellData } from "./budget-shell-data";
import { PageTransition } from "@/components/common/page-transition";
import { ActivePillTaskSlider } from "@/components/budgeting/tasks/active-pill-task-slider";

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

/**
 * Empty sticky band that occupies the EXACT footprint BudgetShellData's real
 * band will (same sticky wrapper + the BdpTabs nav's h-12 height) so the pills
 * fade into place with no layout shift while the band's server fetches resolve.
 */
function BdpBandFallback() {
  return (
    <div
      aria-hidden="true"
      className="sticky top-0 z-40 border-b border-[var(--hairline-dark)] bg-[var(--canvas-dark)]"
    >
      <div className="h-12" />
    </div>
  );
}

export default async function BdpLayout({ children, params }: BdpLayoutProps) {
  // params await is cheap and does NOT gate on the network — the layout still
  // commits synchronously w.r.t. data fetches (those live in BudgetShellData).
  const { locale, id } = await params;

  return (
    <>
      {/* Height-reserving fallback (260618 bug 3): BudgetShellData (the sticky
          pills band) suspends on its server fetches (membership gate +
          reservesEnabled + initialTasks). With fallback={null} the band was
          ABSENT while the page content rendered, then popped in and shoved the
          whole page down ~one band-height — a visible jump on first nav to an
          un-warmed tab. The fallback renders an identical-height empty sticky
          band so the pills fade into reserved space with zero layout shift. */}
      <Suspense fallback={<BdpBandFallback />}>
        <BudgetShellData locale={locale} id={id} />
      </Suspense>
      <div className="pb-shell-safe">
        {/* PageTransition slides the whole tab page (tasks strip + content) as
            ONE unit on a tab switch — old out, new in — all live DOM (motion).
            The tasks strip is the first child so it slides WITH the page (no
            jump). initialTasks=[] → reads the shared ["tasks", budgetId,
            "pending"] query BdpTabs seeds; warm on soft-nav. Its own Suspense
            keeps the useSearchParams CSR bailout local to the strip. */}
        <PageTransition>
          <Suspense fallback={null}>
            <ActivePillTaskSlider
              budgetId={id}
              locale={locale}
              initialTasks={[]}
            />
          </Suspense>
          {children}
        </PageTransition>
      </div>
    </>
  );
}
