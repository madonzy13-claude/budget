/**
 * /budgets/[id]/reserves — RSC page for Reserves tab.
 *
 * Fetches GET /reserves server-side and passes initial data to client island.
 * Fallback initial state (server error / first load) contains excludedRows: []
 * so the client island renders gracefully before any user interaction.
 *
 * W-3: initial data carries both rows + excludedRows from the single /reserves fetch.
 * No separate GET /categories fetch is made anywhere on this page.
 *
 * quick-260612-a0c R2: PillTaskSlider no longer renders here — the BDP layout
 * renders the active pill's slider INSIDE the [data-bdp-tabs] sticky band so
 * it can never slide under the pinned header (see ActivePillTaskSlider).
 */
import { serverApiFetch } from "@/lib/budget-fetch.server";
import { ReservesTableClient } from "@/components/budgeting/reserves-tab/reserves-table-client";

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function ReservesPage({ params }: PageProps) {
  const { id: budgetId } = await params;

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
    <div className="mx-auto w-full max-w-[1280px]">
      <ReservesTableClient budgetId={budgetId} initial={initial} />
    </div>
  );
}
