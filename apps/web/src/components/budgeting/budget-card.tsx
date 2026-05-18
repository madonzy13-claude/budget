/**
 * budget-card.tsx — Home page BudgetCard (HOME-01..03).
 *
 * Async RSC that fetches `/budgets/{id}/home-summary` (Plan 03-02) and renders:
 *   Header: kind icon (Lock | Users) + budget name + type badge.
 *   Stat row: spent_current_month + wallets_value_display_ccy (FX-converted server-side).
 *   Overspent strip: top 1–2 overspent categories with leading "–" prefix, OR
 *                    "All categories on budget" when none.
 *   Error state: static "Couldn't load summary. Tap to open." copy; Link wrapper
 *                still renders so user can dive into the BDP.
 *
 * Pitfall 4: per-budget path → `serverApiFetch(budget.id, ...)`, never null.
 * Pitfall 5: one Next.js Link wraps the whole card — no nested anchors inside.
 *
 * Hover/focus styling follows UI-SPEC §4 (border lift on hover, focus-visible ring).
 */
import Link from "next/link";
import { Lock, Users } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Badge } from "@/components/ui/badge";
import { serverApiFetch } from "@/lib/budget-fetch.server";
import type { BudgetSummary } from "@/components/budgeting/budget-switcher";

interface HomeSummary {
  budgetId: string;
  name: string;
  kind: "PRIVATE" | "SHARED";
  default_currency: string;
  display_currency: string;
  spent_current_month: { amount_cents: string; currency: string };
  wallets_value_display_ccy: {
    amount_cents: string;
    currency: string;
    converted_at: string;
  };
  top_overspent: Array<{
    category_id: string;
    category_name: string;
    over_amount_cents: string;
  }>;
}

interface BudgetCardProps {
  budget: BudgetSummary;
  locale: string;
}

function fmtCurrency(locale: string, cents: string, currency: string): string {
  const v = Number(cents) / 100;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
    }).format(v);
  } catch {
    return `${v.toFixed(2)} ${currency}`;
  }
}

export async function BudgetCard({ budget, locale }: BudgetCardProps) {
  const t = await getTranslations({ locale, namespace: "home" });
  const Icon = budget.kind === "PRIVATE" ? Lock : Users;

  const res = await serverApiFetch(
    budget.id,
    `/budgets/${budget.id}/home-summary`,
  );
  const isError = !res.ok;
  const summary = isError ? null : ((await res.json()) as HomeSummary);

  return (
    <Link
      href={`/${locale}/budgets/${budget.id}/wallets`}
      aria-label={t("card.openAria", { budgetName: budget.name })}
      className="group block rounded-[var(--radius-xl)] bg-[var(--surface-card-dark)] border border-transparent transition-all hover:border-[var(--primary)] hover:scale-[1.01] active:scale-[0.99] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--info-ring)] focus-visible:outline-offset-2"
    >
      {/* Header */}
      <div className="p-6 flex items-center gap-2">
        <Icon
          className="h-4 w-4 text-[var(--body-on-dark)]"
          aria-hidden="true"
        />
        <h3 className="flex-1 text-title-sm font-medium text-[var(--body-on-dark)] truncate">
          {budget.name}
        </h3>
        <Badge variant="secondary" className="text-caption uppercase">
          {budget.kind}
        </Badge>
      </div>
      <div className="h-px bg-[var(--hairline-dark)]" />

      {isError || !summary ? (
        <div className="p-6">
          <p className="text-sm text-[var(--muted-foreground)]">
            {t("card.error")}
          </p>
        </div>
      ) : (
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
      )}
    </Link>
  );
}
