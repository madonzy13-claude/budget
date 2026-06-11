import { redirect } from "next/navigation";
import { serverApiFetch } from "@/lib/budget-fetch.server";
import { BdpTabs } from "@/components/budgeting/bdp-tabs";
import type { TaskSummary } from "@/components/budgeting/task-banner-row";

/**
 * BDP layout (Plan 03-06 BDP-01) — single sticky wrapper at top:64px holding
 * the optional task banner + pill tabs row, then `{children}` (tab content).
 *
 * Z-stack (locked across phases):
 *   - top-nav header z-50 (Plan 03-04)
 *   - BDP sticky wrapper z-40 (this layout)
 *   - BudgetSwitcher PopoverContent z-[60] (Plan 03-04 — must sit above both)
 *
 * Membership gate (T-03-06-01): fetch /budgets/active and verify `id` is in
 * the list; on miss redirect to `/${locale}` (home) — NOT /workspaces (gone).
 *
 * Tasks-Redesign: initialTasks passed to BdpTabs (and from there to each pill's
 * PillTaskSlider). TaskBanner removed from layout — per-pill sliders replace it.
 *
 * Pitfall 4 guard: every /budgets/{id}/... fetch passes `id` as the
 * serverApiFetch first arg so X-Budget-ID is set (T-03-06-08).
 */

interface BdpLayoutProps {
  children: React.ReactNode;
  params: Promise<{ locale: string; id: string }>;
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

export default async function BdpLayout({ children, params }: BdpLayoutProps) {
  const { locale, id } = await params;

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
      {/* pb-shell-safe: standalone-only bottom clearance INSIDE the page
          content — the only placement iOS WebKit honors (see global.css). */}
      <div className="pb-shell-safe">{children}</div>
    </>
  );
}
