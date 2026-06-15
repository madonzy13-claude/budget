import { serverApiFetch } from "@/lib/budget-fetch.server";
import { BrandMark } from "@/components/common/brand-mark";
import { ProfileMenu } from "@/components/auth/profile-menu";
import { OfflineStatusBadge } from "@/components/common/offline-status-badge";
import { getServerSession } from "@/lib/server-session";
import {
  BudgetSwitcher,
  type BudgetSummary,
} from "@/components/budgeting/budget-switcher";

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
  // Parallel: budgets list + session lookup. Session is already cached
  // upstream by the (app) layout for this render pass, so this is a
  // free read.
  const [budgets, session] = await Promise.all([
    fetchBudgets(),
    getServerSession(),
  ]);
  return (
    <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-2 px-4 sm:px-8">
      {/* Brand — fixed width, never shrinks. */}
      <BrandMark href={`/${locale}`} />
      {/* Switcher takes the slack and TRUNCATES so the offline pill + avatar on
          the right are never pushed off-screen (min-w-0 lets the flex child
          shrink below its content width). */}
      <div className="min-w-0 flex-1">
        <BudgetSwitcher
          budgets={budgets}
          activeBudgetId={activeBudgetId}
          locale={locale}
        />
      </div>
      {/* Right cluster — fixed, always fully visible at the right edge. */}
      <div className="flex shrink-0 items-center gap-2">
        {/* Inline offline pill — zero-height, sits inside the 64px header (no
            layout shift). Client leaf inside this server component — fine. */}
        <OfflineStatusBadge budgetId={activeBudgetId} />
        {session?.user && (
          <ProfileMenu
            locale={locale}
            user={{
              name: session.user.name,
              email: session.user.email,
            }}
          />
        )}
      </div>
    </div>
  );
}
