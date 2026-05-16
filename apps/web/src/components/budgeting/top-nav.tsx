import { serverApiFetch } from "@/lib/budget-fetch.server";
import { BrandMark } from "@/components/common/brand-mark";
import { SignOutButton } from "@/components/auth/sign-out-button";
import {
  BudgetSwitcher,
  type BudgetSummary,
} from "@/components/budgeting/budget-switcher";
import { NewBudgetButton } from "@/components/budgeting/new-budget-button";

interface TopNavProps {
  locale: string;
  activeBudgetId: string | null;
}

/**
 * Fetches the list of budgets the current user can access. Reads either
 * `body.budgets` (Plan 03-02 dual-emit canonical key) or `body.workspaces`
 * (legacy alias also emitted by /budgets/active during the Phase 3 transition).
 */
async function fetchBudgets(): Promise<BudgetSummary[]> {
  const res = await serverApiFetch(null, "/budgets/active");
  if (!res.ok) return [];
  const body = (await res.json()) as {
    budgets?: BudgetSummary[];
    workspaces?: BudgetSummary[];
  };
  return body.budgets ?? body.workspaces ?? [];
}

/**
 * TopNav — RSC composition of the v1.1 top app shell (UI-SPEC §1).
 * Mounted inside the (app)/layout.tsx header. Owns the inner layout: max
 * width 1280px, height 64px, 32px outer gutter on desktop / 16px on mobile.
 * BrandMark href points to `/${locale}` (the new home), NOT `/${locale}/budgets`
 * which no longer exists after Plan 03-01 deletion.
 */
export async function TopNav({ locale, activeBudgetId }: TopNavProps) {
  const budgets = await fetchBudgets();
  return (
    <div className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-4 sm:px-8">
      <div className="flex items-center gap-3">
        <BrandMark href={`/${locale}`} />
        <BudgetSwitcher
          budgets={budgets}
          activeBudgetId={activeBudgetId}
          locale={locale}
        />
        <NewBudgetButton locale={locale} />
      </div>
      <div className="flex items-center gap-3">
        <SignOutButton locale={locale} />
      </div>
    </div>
  );
}
