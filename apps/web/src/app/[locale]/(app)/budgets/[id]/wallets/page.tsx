/**
 * /budgets/[id]/wallets — RSC page.
 *
 * Fetches wallet list + budget metadata in parallel via serverApiFetch
 * (X-Budget-ID header set automatically — T-04-04-07 mitigation).
 * Passes initialData to the WalletsSectionedList client island for instant SSR.
 *
 * Replaces the Phase 3 placeholder.
 */
import { serverApiFetch } from "@/lib/budget-fetch.server";
import { WalletsSectionedList } from "@/components/budgeting/wallets-tab/wallets-sectioned-list";
import type { WalletDto } from "@/hooks/use-wallets";

// quick-260612-a0c R2: PillTaskSlider no longer renders here — the BDP layout
// renders the active pill's slider INSIDE the [data-bdp-tabs] sticky band so
// it can never slide under the pinned header (see ActivePillTaskSlider).

interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

export default async function WalletsPage({ params }: PageProps) {
  const { id: budgetId } = await params;

  const [walletsRes, budgetRes] = await Promise.all([
    serverApiFetch(budgetId, "/wallets"),
    serverApiFetch(budgetId, `/budgets/${budgetId}`),
  ]);

  const wallets: WalletDto[] = walletsRes.ok
    ? (((await walletsRes.json()) as { wallets?: WalletDto[] }).wallets ?? [])
    : [];

  const budget = budgetRes.ok
    ? await (budgetRes.json() as Promise<{
        defaultCurrency?: string;
        default_currency?: string;
        reservesEnabled?: boolean;
        cushionEnabled?: boolean;
      }>)
    : null;

  // GET /budgets/:id returns camelCase `defaultCurrency` per the API route handler
  const budgetCurrency =
    budget?.defaultCurrency ?? budget?.default_currency ?? "EUR";

  // D-PH5-R11 cascading-hide surface 4: when reservesEnabled=false, the
  // Reserve wallet section disappears from the Wallets tab too. Default
  // true preserves existing UX when the budget meta fetch fails.
  const reservesEnabled = budget?.reservesEnabled ?? true;

  // Phase 6 onboarding rewrite: parallel cascade for cushion_enabled.
  // When false, the Cushion wallet section disappears from the Wallets
  // tab. Default true to preserve UX on stale clients / fetch failures.
  const cushionEnabled = budget?.cushionEnabled ?? true;

  // UAT-PH5-T3-04: constrain wallets to the same centered 1280px column the
  // Settings tab uses. Spendings stays full-bleed because it's a horizontally
  // scrolling grid.
  // Plain wrapper — wallets uses the layout's <main> scroll surface
  // now (same as home + spendings). No bounded inner container, no
  // forced height; content ends where content ends and the canvas
  // fills the rest of the viewport without a visible boundary.
  return (
    <div className="mx-auto w-full max-w-[1280px]">
      <WalletsSectionedList
        budgetId={budgetId}
        budgetCurrency={budgetCurrency}
        initial={wallets}
        reservesEnabled={reservesEnabled}
        cushionEnabled={cushionEnabled}
      />
    </div>
  );
}
