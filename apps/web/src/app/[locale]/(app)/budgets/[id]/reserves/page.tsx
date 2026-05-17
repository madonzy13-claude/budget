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
          totalCategoryReservesCents: "0",
          totalReserveWalletAmountCents: "0",
          mismatchCents: "0",
          disabled: false,
          budgetCurrency: "EUR",
        },
      };

  return <ReservesTableClient budgetId={budgetId} initial={initial} />;
}
