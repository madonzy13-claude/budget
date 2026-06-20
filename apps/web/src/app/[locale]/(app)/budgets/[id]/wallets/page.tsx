/**
 * /budgets/[id]/wallets — STATIC RSC shell (SPA refactor 260616).
 *
 * No server data fetch. A dynamic serverApiFetch here (reads cookies) forced
 * the segment to re-execute on EVERY soft-nav and flash loading.tsx — even when
 * the client React Query cache was warm from seconds ago. Removing it makes the
 * route a prefetchable static shell, so returning to Wallets renders the cached
 * data instantly with no skeleton.
 *
 * The wallet list AND the budget meta (currency + section flags) are now fetched
 * client-side by WalletsSectionedList via useWallets + useBudget — both served
 * instantly from the persisted React Query cache when warm, skeleton only on a
 * genuine cold load.
 */
import { WalletsSectionedList } from "@/components/budgeting/wallets-tab/wallets-sectioned-list";

// quick-260612-a0c R2: PillTaskSlider no longer renders here — the BDP layout
// renders the active pill's slider INSIDE the [data-bdp-tabs] sticky band so
// it can never slide under the pinned header (see ActivePillTaskSlider).

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function WalletsPage({ params }: PageProps) {
  const { id: budgetId } = await params;

  return (
    <div className="mx-auto w-full max-w-[1280px]">
      <WalletsSectionedList budgetId={budgetId} />
    </div>
  );
}
