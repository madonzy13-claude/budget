import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/budget-fetch.server";
import { BdpTabs } from "@/components/budgeting/bdp-tabs";
import type { TaskSummary } from "@/components/budgeting/task-banner-row";

/**
 * budget-shell-data.tsx — quick-260613-pdb (Issue 3, Option A).
 *
 * Suspense-wrapped server child extracted from layout.tsx. Holds ALL the
 * awaited data work so the BDP layout itself can commit synchronously and
 * NOT trigger the generic budgets/[id]/loading.tsx skeleton. With the layout
 * non-suspending and budgets/[id]/loading.tsx deleted, the only Suspense
 * fallback shown on home→tab navigation is the child tab page's own
 * loading.tsx (wallets/reserves/spendings/settings) — single skeleton, no
 * double chrome-then-tab flash.
 *
 * Preserved verbatim from the old layout:
 *   - Membership gate (T-03-06-01): fetch /budgets/active, redirect to
 *     /{locale} on miss. SECURITY-CRITICAL. redirect() throws before the
 *     return, so it executes before any budget-scoped UI commits. The chrome
 *     rendered below is generic (pills + slider), and the page itself is
 *     RLS-protected via X-Budget-ID, so no other-tenant data leaks.
 *   - reservesEnabled read (default true) → BdpTabs (D-PH5-R11 cascading-hide).
 *   - initialTasks → BdpTabs (badges) + ActivePillTaskSlider (per-pill strip).
 *   - Sticky band wrapper (z-40, data-testid=bdp-sticky-wrapper, data-bdp-tabs).
 *   - ActivePillTaskSlider in its own <Suspense fallback={null}> (deep-link
 *     ?task= useSearchParams CSR bailout boundary).
 *
 * Pitfall 4 guard: every /budgets/{id}/... fetch passes `id` as the
 * serverApiFetch first arg so X-Budget-ID is set (T-03-06-08).
 */

interface BudgetShellDataProps {
  locale: string;
  id: string;
}

async function fetchInitialTasks(budgetId: string): Promise<TaskSummary[]> {
  const res = await serverApiFetch(
    budgetId,
    `/budgets/${budgetId}/tasks?status=pending`,
  );
  if (!res.ok) return [];
  const body = (await res.json()) as { tasks?: TaskSummary[] };
  return body.tasks ?? [];
}

export async function BudgetShellData({ locale, id }: BudgetShellDataProps) {
  // Membership check — fetch active budgets and confirm `id` is among them.
  // Also fetch budget meta to read reservesEnabled (D-PH5-R11 cascading-hide surface 1).
  // Next.js dedupes identical fetch URLs within the same render pass.
  const [activeRes, budgetRes, initialTasks] = await Promise.all([
    serverApiFetch(null, "/budgets/active"),
    serverApiFetch(id, `/budgets/${id}`),
    fetchInitialTasks(id),
  ]);

  if (activeRes.ok) {
    const body = (await activeRes.json()) as {
      budgets?: Array<{ id: string }>;
      workspaces?: Array<{ id: string }>;
    };
    const list = body.budgets ?? body.workspaces ?? [];
    if (!list.some((b) => b.id === id)) redirect(`/${locale}`);
  }

  // D-PH5-R11: read reservesEnabled; default true preserves existing UX.
  const reservesEnabled = budgetRes.ok
    ? (((await budgetRes.json()) as { reservesEnabled?: boolean })
        .reservesEnabled ?? true)
    : true;

  return (
    <>
      <div
        className="sticky top-0 z-40 border-b border-[var(--hairline-dark)] bg-[var(--canvas-dark)]"
        data-testid="bdp-sticky-wrapper"
        data-bdp-tabs
      >
        <BdpTabs
          locale={locale}
          budgetId={id}
          reservesEnabled={reservesEnabled}
          initialTasks={initialTasks}
        />
      </div>
      {/* The tasks strip used to render here (chrome). 260618: it moved INTO the
          sliding page region (BDP layout → TabSlide) so it slides as ONE unit
          with the page on a tab switch instead of jumping. Pills stay here as the
          sticky chrome. */}
    </>
  );
}
