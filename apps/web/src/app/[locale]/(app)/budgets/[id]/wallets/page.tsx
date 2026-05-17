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
      }>)
    : null;

  // GET /budgets/:id returns camelCase `defaultCurrency` per the API route handler
  const budgetCurrency =
    budget?.defaultCurrency ?? budget?.default_currency ?? "EUR";

  return (
    <WalletsSectionedList
      budgetId={budgetId}
      budgetCurrency={budgetCurrency}
      initial={wallets}
    />
  );
}
