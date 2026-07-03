import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/budget-fetch.server";
import { BudgetDetail } from "@/components/budgeting/budget-detail";
import { isBdpTab, type BdpTab } from "@/lib/bdp-tabs";
import type { TaskSummary } from "@/components/budgeting/task-banner-row";

/**
 * Budget Detail Page — catch-all `[[...tab]]` route.
 *
 * One route segment serves every tab URL (`/budgets/[id]`, `…/wallets`,
 * `…/spendings`, `…/reserves`, `…/settings`). The tab is read from the path here
 * (for direct loads / bookmarks / deep-links) and seeded into <BudgetDetail>,
 * which from then on switches tabs in pure client state (pushState, no Next nav)
 * so there is no per-tab RSC round-trip. Replaces the old four per-tab routes +
 * the index redirect + the FrozenRouter route-carousel.
 *
 * SECURITY (T-03-06-01): the membership gate runs server-side BEFORE rendering —
 * fetch /budgets/active and redirect to /{locale} if `id` is not a member's
 * budget. redirect() throws, so no budget-scoped UI commits on a miss (and the
 * panes are RLS-protected via X-Budget-ID regardless). reservesEnabled
 * (D-PH5-R11 cascading-hide) and initialTasks (badges + slider) are read here and
 * passed down. Pitfall 4: every /budgets/{id}/... fetch passes `id` as the
 * serverApiFetch first arg so X-Budget-ID is set (T-03-06-08).
 */

interface BdpPageProps {
  params: Promise<{ locale: string; id: string; tab?: string[] }>;
  searchParams: Promise<{ task?: string }>;
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

export default async function BdpPage({ params, searchParams }: BdpPageProps) {
  const { locale, id, tab } = await params;
  const seg = tab?.[0];

  // Canonical URL: bare /budgets/[id] (or an unknown tab) → /overview (the first
  // pill — opening a budget lands on the Overview snapshot, Phase 11 UAT).
  if (!isBdpTab(seg)) redirect(`/${locale}/budgets/${id}/overview`);

  // Membership gate + reservesEnabled + initial task summaries.
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

  const reservesEnabled = budgetRes.ok
    ? (((await budgetRes.json()) as { reservesEnabled?: boolean })
        .reservesEnabled ?? true)
    : true;

  // A deep-link to /reserves on a reserves-disabled budget still renders the
  // Reserves pane so its "reserves disabled" notice shows (the pill is hidden by
  // BdpTabs, but the direct URL is honoured — matches the pre-refactor route).
  const initialTab: BdpTab = seg;

  const focusTaskId = (await searchParams)?.task;

  return (
    <BudgetDetail
      locale={locale}
      budgetId={id}
      initialTab={initialTab}
      reservesEnabled={reservesEnabled}
      initialTasks={initialTasks}
      focusTaskId={focusTaskId}
    />
  );
}
