/**
 * /budgets/[id]/reserves — STATIC RSC shell (SPA refactor 260616).
 *
 * No server data fetch — a dynamic serverApiFetch here would re-execute on every
 * soft-nav and flash loading.tsx. ReservesTableClient fetches GET /reserves
 * client-side via useReservesSummary and renders instantly from the warm/
 * persisted React Query cache (skeleton only on a genuine cold load).
 */
import { ReservesTableClient } from "@/components/budgeting/reserves-tab/reserves-table-client";

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function ReservesPage({ params }: PageProps) {
  const { id: budgetId } = await params;

  // UAT-PH5-T3-04: constrain reserves to the same centered 1280px column.
  return (
    <div className="mx-auto w-full max-w-[1280px]">
      <ReservesTableClient budgetId={budgetId} />
    </div>
  );
}
