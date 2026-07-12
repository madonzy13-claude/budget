import { serverApiFetch } from "@/lib/budget-fetch.server";
import { BrandMark } from "@/components/common/brand-mark";
import { ProfileMenu } from "@/components/auth/profile-menu";
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
    <div className="mx-auto flex h-16 max-w-[1280px] items-center gap-2 px-4 max-sm:grid max-sm:grid-cols-[1fr_auto_1fr] sm:px-8">
      {/* Brand — fixed width, never shrinks. r35: ?list=1 forces the budget
          LISTING (bypasses the last-budget auto-open) when there's >1 budget; a
          single-budget user still lands on that budget's overview. */}
      <BrandMark href={`/${locale}?list=1`} />
      {/* Switcher takes the slack and TRUNCATES so the offline pill + avatar on
          the right are never pushed off-screen (min-w-0 lets the flex child
          shrink below its content width). Mobile: the header is a 1fr/auto/1fr
          grid, so the switcher (centre column) is truly centred on the bar while
          staying IN FLOW — Radix anchors the dropdown to it cleanly. Desktop keeps
          the in-flow flex-1 left alignment. */}
      <div className="min-w-0 flex-1 max-sm:flex-none max-sm:justify-self-center">
        <BudgetSwitcher
          budgets={budgets}
          activeBudgetId={activeBudgetId}
          locale={locale}
        />
      </div>
      {/* Right cluster — fixed, always fully visible at the right edge. The
          offline indicator is no longer here — it's a full-width red staleness
          bar mounted below the header in the (app) layout (OfflineStaleBar). */}
      {/* Right column of the mobile grid → pinned to the right edge. */}
      <div className="flex shrink-0 items-center gap-2 max-sm:justify-self-end">
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
