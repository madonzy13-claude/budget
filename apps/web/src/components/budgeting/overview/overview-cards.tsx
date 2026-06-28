"use client";
/**
 * overview-cards.tsx — the five Overview summary cards (Phase 11, 11-08, DD-1).
 *
 * Layout: a full-width Capitalization hero card on top, then a 2-col grid of four
 * (available-to-spend, available reserves, overspent-this-month, cushion). All
 * amounts in the budget default_currency (D-11), tabular figures via `.num`. Width-
 * flexible grid (no fixed px) so there's no horizontal scroll at 375px (SC1).
 *
 * Theme: every color is a CSS-var token (--surface-card-dark / --primary /
 * --trading-down / --muted-foreground …) so the cards render correctly in BOTH the
 * dark and light themes — no hardcoded hex.
 */
import { useTranslations, useLocale } from "next-intl";
import { useOverviewCards } from "@/hooks/use-overview-cards";
import { centsToDisplay } from "@/lib/cents-format";

const CARD =
  "rounded-[var(--radius-xl)] bg-[var(--surface-card-dark)] border border-[var(--hairline-dark)] p-4 min-w-0";

function CardLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-caption text-[var(--muted-foreground)]">{children}</p>
  );
}

export function OverviewCards({ budgetId }: { budgetId: string }) {
  const t = useTranslations("bdp.tab.overview");
  const locale = useLocale();
  const { data, isError, isPending } = useOverviewCards(budgetId);

  if (isPending) {
    return (
      <div data-testid="overview-cards" className="flex flex-col gap-3">
        <div className={`${CARD} h-28 animate-pulse`} />
        <div className="grid grid-cols-2 gap-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className={`${CARD} h-24 animate-pulse`} />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div data-testid="overview-cards" className={CARD}>
        <p className="text-num-sm text-[var(--muted-foreground)]">
          {t("empty.planned")}
        </p>
      </div>
    );
  }

  const ccy = data.default_currency;
  const money = (cents: string) => centsToDisplay(cents, ccy, locale);
  const hasInvestments = BigInt(data.investment_value_cents) > 0n;
  const overspentCount = data.overspent.count;
  const topNames = data.overspent.top.map((o) => o.name).join(" · ");

  return (
    <div data-testid="overview-cards" className="flex flex-col gap-3">
      {/* Hero: Capitalization (net worth) — the single big yellow figure (DD-1). */}
      <section data-testid="overview-card-capitalization" className={CARD}>
        <CardLabel>{t("cards.capitalization")}</CardLabel>
        <p className="num text-num-display mt-1 text-[var(--primary)]">
          {money(data.capitalization_cents)}
        </p>
        {hasInvestments && (
          <p className="text-caption mt-1 text-[var(--muted-foreground)]">
            {t("cards.capitalizationSub", {
              amount: money(data.investment_value_cents),
            })}
          </p>
        )}
      </section>

      <div className="grid grid-cols-2 gap-3">
        {/* Available to spend */}
        <section
          data-testid="overview-card-available-to-spend"
          className={CARD}
        >
          <CardLabel>{t("cards.availableToSpend")}</CardLabel>
          <p className="num text-display-sm mt-1 truncate text-[var(--body-on-dark)]">
            {money(data.available_to_spend_cents)}
          </p>
        </section>

        {/* Available reserves */}
        <section
          data-testid="overview-card-available-reserves"
          className={CARD}
        >
          <CardLabel>{t("cards.availableReserves")}</CardLabel>
          <p className="num text-display-sm mt-1 truncate text-[var(--body-on-dark)]">
            {money(data.available_reserves_cents)}
          </p>
        </section>

        {/* Overspent this month — calm "On budget" when zero, red when > 0. */}
        <section data-testid="overview-card-overspent" className={CARD}>
          <CardLabel>{t("cards.overspent")}</CardLabel>
          {overspentCount === 0 ? (
            <p className="text-title-sm mt-1 text-[var(--muted-foreground)]">
              {t("cards.onBudget")}
            </p>
          ) : (
            <>
              <p className="text-title-sm mt-1 text-[var(--trading-down)]">
                {t("cards.overspentCount", { count: overspentCount })}
              </p>
              {topNames && (
                <p className="text-caption mt-1 truncate text-[var(--muted-foreground)]">
                  {topNames}
                </p>
              )}
            </>
          )}
        </section>

        {/* Cushion — real months (1 decimal) + total, or muted "Cushion off". */}
        <section data-testid="overview-card-cushion" className={CARD}>
          <CardLabel>{t("cards.cushion")}</CardLabel>
          {data.cushion.enabled ? (
            <>
              <p className="num text-display-sm mt-1 truncate text-[var(--body-on-dark)]">
                {t("cards.cushionMonths", {
                  months: data.cushion.real_months.toFixed(1),
                })}
              </p>
              <p className="text-caption mt-1 text-[var(--muted-foreground)]">
                {money(data.cushion.total_cents)} · {t("cards.realMonths")}
              </p>
            </>
          ) : (
            <p className="text-title-sm mt-1 text-[var(--muted-foreground)]">
              {t("cards.cushionOff")}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}
