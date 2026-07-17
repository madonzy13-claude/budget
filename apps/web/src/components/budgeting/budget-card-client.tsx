"use client";
/**
 * budget-card-client.tsx — Home BudgetCard (client-data, SPA refactor 260616).
 *
 * Replaces the async server BudgetCard. The header (name + kind + pending-task
 * badge) is known from the BudgetSummary list, so it paints immediately; the
 * stat body is fed by useHomeSummary — skeleton while it loads (cold), error
 * copy on failure, data once available. On re-nav the summary is warm in the
 * React Query cache, so the full card renders instantly.
 */
import { NavLink } from "@/components/common/nav-link";
import { Lock, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { BudgetSummary } from "@/components/budgeting/budget-switcher";
import { PillBadge } from "@/components/budgeting/tasks/pill-badge";
import { centsToDisplayCompact } from "@/lib/cents-format";
import { useHomeSummary } from "@/hooks/use-home-summary";

interface BudgetCardClientProps {
  budget: BudgetSummary;
  locale: string;
}

function fmtCurrency(locale: string, cents: string, currency: string): string {
  return centsToDisplayCompact(cents, currency, locale);
}

export function BudgetCardClient({ budget, locale }: BudgetCardClientProps) {
  const t = useTranslations("home");
  const tNav = useTranslations("nav.switcher");
  // kind-removal: private/shared is derived from member count, not a stored kind.
  const isShared = (budget.memberCount ?? 1) > 1;
  const Icon = isShared ? Users : Lock;

  const q = useHomeSummary(budget.id);
  const summary = q.data ?? null;
  const showError = q.isError && !summary;

  return (
    <NavLink
      href={`/${locale}/budgets/${budget.id}/overview`}
      aria-label={t("card.openAria", { budgetName: budget.name })}
      className="relative group block rounded-[var(--radius-xl)] bg-[var(--surface-card-dark)] border border-transparent transition-all hover:border-[var(--primary)] hover:scale-[1.01] active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-2"
    >
      {/* Corner badge — absolute-positioned, needs `relative` on NavLink wrapper */}
      <span className="absolute top-3 right-3 pointer-events-none">
        <PillBadge
          count={budget.pendingTasksCount}
          ariaLabel={t("card.pendingTasksAria", {
            count: budget.pendingTasksCount,
          })}
        />
      </span>
      {/* Header — known from the budget list, paints immediately. */}
      <div className="p-6 flex items-center gap-2">
        <Icon
          className="h-4 w-4 text-[var(--body-on-dark)]"
          aria-hidden="true"
        />
        <h3 className="flex-1 text-title-sm font-medium text-[var(--body-on-dark)] truncate">
          {budget.name}
        </h3>
        <Badge variant="secondary" className="text-caption uppercase">
          {tNav(isShared ? "shared" : "personal")}
        </Badge>
      </div>
      <div className="h-px bg-[var(--hairline-dark)]" />

      {summary ? (
        <>
          {/* Stat row */}
          <div className="p-6 grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <p className="text-caption uppercase tracking-wide text-[var(--muted-foreground)]">
                {t("card.spent")}
              </p>
              <p className="text-num-md tabular-nums text-[var(--body-on-dark)]">
                {fmtCurrency(
                  locale,
                  summary.spent_current_month.amount_cents,
                  summary.spent_current_month.currency,
                )}
              </p>
            </div>
            <div className="space-y-1">
              <p className="text-caption uppercase tracking-wide text-[var(--muted-foreground)]">
                {t("card.wallets")}
              </p>
              <p className="text-num-md tabular-nums text-[var(--body-on-dark)]">
                {fmtCurrency(
                  locale,
                  summary.wallets_value_display_ccy.amount_cents,
                  summary.wallets_value_display_ccy.currency,
                )}
              </p>
            </div>
          </div>
          <div className="h-px bg-[var(--hairline-dark)]" />

          {/* Overspent strip */}
          <div className="p-6">
            {summary.top_overspent.length === 0 ? (
              <p className="text-caption text-[var(--muted-foreground)] text-center">
                {t("card.allOnBudget")}
              </p>
            ) : (
              <ul className="space-y-1">
                {summary.top_overspent.slice(0, 2).map((o) => (
                  <li
                    key={o.category_id}
                    className="flex items-center gap-2 text-sm"
                  >
                    <span
                      className="text-[var(--muted-strong)]"
                      aria-hidden="true"
                    >
                      –
                    </span>
                    <span className="flex-1 truncate text-[var(--body-on-dark)]">
                      {o.category_name}
                    </span>
                    <span className="num tabular-nums text-[var(--body-on-dark)]">
                      {fmtCurrency(
                        locale,
                        o.over_amount_cents,
                        summary.default_currency,
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </>
      ) : showError ? (
        <div className="p-6">
          <p className="text-sm text-[var(--muted-foreground)]">
            {t("card.error")}
          </p>
        </div>
      ) : (
        /* Cold load — stat body skeleton. */
        <>
          <div className="p-6 grid grid-cols-2 gap-4" aria-hidden="true">
            <div className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
            <div className="space-y-2">
              <Skeleton className="h-3 w-16" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
          <div className="h-px bg-[var(--hairline-dark)]" />
          <div className="p-6 space-y-2" aria-hidden="true">
            <Skeleton className="h-4 w-40" />
          </div>
        </>
      )}
    </NavLink>
  );
}
