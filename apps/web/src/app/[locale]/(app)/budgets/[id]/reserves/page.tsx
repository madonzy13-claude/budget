/**
 * /budgets/[id]/reserves — RSC page for Reserves tab.
 *
 * Fetches GET /reserves server-side and passes initial data to client island.
 * Fallback initial state (server error / first load) contains excludedRows: []
 * so the client island renders gracefully before any user interaction.
 *
 * W-3: initial data carries both rows + excludedRows from the single /reserves fetch.
 * No separate GET /categories fetch is made anywhere on this page.
 */
import { serverApiFetch } from "@/lib/budget-fetch.server";
import { ReservesTableClient } from "@/components/budgeting/reserves-tab/reserves-table-client";
import { PillTaskSlider } from "@/components/budgeting/tasks/pill-task-slider";
import type { TaskSummary } from "@/components/budgeting/task-banner-row";

async function fetchInitialTasks(budgetId: string): Promise<TaskSummary[]> {
  const res = await serverApiFetch(
    budgetId,
    `/budgets/${budgetId}/tasks?status=pending`,
  );
  if (!res.ok) return [];
  const body = (await res.json()) as { tasks?: TaskSummary[] };
  return body.tasks ?? [];
}

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function ReservesPage({ params }: PageProps) {
  const { locale, id: budgetId } = await params;

  const initialTasks = await fetchInitialTasks(budgetId);

  const res = await serverApiFetch(budgetId, `/budgets/${budgetId}/reserves`);

  const initial = res.ok
    ? await res.json()
    : {
        rows: [],
        excludedRows: [],
        totals: {
          internalCents: "0",
          userDefinedCents: "0",
          surplusCents: "0",
          direction: "NONE" as const,
          disabled: false,
          budgetCurrency: "EUR",
        },
      };

  // UAT-PH5-T3-04: constrain reserves to the same centered 1280px column.
  return (
    <>
      <PillTaskSlider
        budgetId={budgetId}
        locale={locale}
        pill="reserves"
        initialTasks={initialTasks}
      />
      <div className="mx-auto w-full max-w-[1280px]">
        <ReservesTableClient budgetId={budgetId} initial={initial} />
      </div>
    </>
  );
}
