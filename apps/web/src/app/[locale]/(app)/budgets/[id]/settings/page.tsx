import { serverApiFetch } from "@/lib/budget-fetch.server";
import { SettingsAccordion } from "@/components/settings/settings-accordion";
import type { SettingsBudget } from "@/components/settings/settings-accordion";

// quick-260612-a0c R2: PillTaskSlider no longer renders here — the BDP layout
// renders the active pill's slider INSIDE the [data-bdp-tabs] sticky band so
// it can never slide under the pinned header (see ActivePillTaskSlider).

/**
 * /budgets/[id]/settings — Phase 6 settings tab.
 *
 * RSC that fetches budget metadata server-side, then renders
 * the 5-section SettingsAccordion client island.
 */
interface PageProps {
  params: Promise<{ locale: string; id: string }>;
}

interface BudgetApiResponse {
  id: string;
  name: string;
  kind: "SHARED" | "PRIVATE";
  defaultCurrency?: string;
  default_currency?: string;
  cushionModeEnabled?: boolean;
  cushion_mode_enabled?: boolean;
  cushionEnabled?: boolean;
  cushion_enabled?: boolean;
  cushionTargetMonths?: number;
  cushion_target_months?: number;
  hasTransactions?: boolean;
  has_transactions?: boolean;
  currentUserRole?: "owner" | "member";
  current_user_role?: "owner" | "member";
}

export default async function BdpSettingsPage({ params }: PageProps) {
  const { id: budgetId } = await params;

  const res = await serverApiFetch(budgetId, `/budgets/${budgetId}`);
  const raw: BudgetApiResponse | null = res.ok
    ? ((await res.json()) as BudgetApiResponse)
    : null;

  const budget: SettingsBudget = {
    id: budgetId,
    name: raw?.name ?? "",
    kind: raw?.kind ?? "PRIVATE",
    defaultCurrency: raw?.defaultCurrency ?? raw?.default_currency ?? "USD",
    cushionModeEnabled:
      raw?.cushionModeEnabled ?? raw?.cushion_mode_enabled ?? false,
    cushionEnabled: raw?.cushionEnabled ?? raw?.cushion_enabled ?? true,
    cushionTargetMonths:
      raw?.cushionTargetMonths ?? raw?.cushion_target_months ?? 6,
    hasTransactions: raw?.hasTransactions ?? raw?.has_transactions ?? false,
    currentUserRole: raw?.currentUserRole ?? raw?.current_user_role ?? "member",
  };

  return (
    <main className="mx-auto w-full max-w-[1280px] px-4 pt-6 pb-12 sm:px-6 sm:pb-16">
      {/* h1 omitted — the BDP tab "Settings" is already the page title. */}
      <SettingsAccordion budget={budget} />
    </main>
  );
}
