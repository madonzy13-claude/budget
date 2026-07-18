"use client";
/**
 * aggregate-overview.tsx — cross-budget "all budgets" overview.
 *
 * Styled to mirror the single-budget BDP Overview tab (overview-cards.tsx): a
 * full-width net-worth hero card + a grid-cols-2 stat grid + section cards.
 *
 * Only budgets the member INCLUDES are rendered (`b.included`) — inclusion is a
 * per-budget self-setting on the budget's own Settings → General page, not
 * toggled here. Every figure is STRING cents already FX-converted into
 * `display_currency` by the API (Task 6/7); summing them as BigInt then
 * formatting once is correct because every row shares that one currency.
 *
 * fx_unavailable rows (FX miss OR card-fetch error) are shown with a "rate
 * unavailable" notice but never summed and never given a health dot / net-worth
 * figure, since `health` on those rows can be a meaningless "green".
 */
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import {
  useBudgetsAggregate,
  type AggregateBudgetRow,
} from "@/hooks/use-budgets-aggregate";
import {
  SlotAmount,
  SlotRevealProvider,
} from "@/components/budgeting/overview/slot-amount";
import { centsToRounded } from "@/lib/cents-format";
import { AggregateComposition } from "@/components/budgeting/aggregate/aggregate-composition";
import { AggregateTrend } from "@/components/budgeting/aggregate/aggregate-trend";

const CARD =
  "rounded-[var(--radius-xl)] bg-[var(--surface-card-dark)] border border-[var(--hairline-dark)] p-4 min-w-0";
const DOT: Record<AggregateBudgetRow["health"], string> = {
  red: "var(--trading-down)",
  amber: "var(--primary)",
  green: "var(--trading-up)",
};

function sumCents(rows: AggregateBudgetRow[], key: keyof AggregateBudgetRow) {
  return rows.reduce((total, r) => total + BigInt(r[key] as string), 0n);
}

/** Mirrors overview-cards.tsx's heroFontClass: shrink the hero number as the
 * formatted string grows so a big combined total doesn't overflow the card. */
function heroFontClass(s: string): string {
  if (s.length >= 13) return "text-[28px] font-bold leading-[1.1]";
  if (s.length >= 10) return "text-[36px] font-bold leading-[1.1]";
  return "text-num-display";
}

/** One BDP-overview-style stat card: caption label + a single big figure. */
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <section className={CARD}>
      <p className="text-caption text-[var(--muted-foreground)]">{label}</p>
      <p className="num mt-1 text-[20px] font-semibold text-[var(--body)]">
        <SlotAmount value={value} />
      </p>
    </section>
  );
}

export function AggregateOverview() {
  const t = useTranslations("aggregate");
  const locale = useLocale();
  const { data, isPending, isError } = useBudgetsAggregate();

  if (isPending)
    return (
      <div
        className="mx-auto max-w-[1280px] p-4"
        data-testid="aggregate-loading"
      />
    );
  if (isError || !data) return null;

  const ccy = data.display_currency;
  // Matches the overview page's convention (overview-cards.tsx): EN locale +
  // narrow symbol always, whole units — no cents anywhere.
  const fmt = (cents: string | bigint) =>
    centsToRounded(cents, ccy, "en", true);

  // Render only budgets the member includes — inclusion is set per-budget in
  // Settings → General, not here (excluded budgets are not shown at all).
  const visible = data.budgets.filter((b) => b.included);
  const summable = visible.filter((b) => !b.fx_unavailable);
  const netWorth = sumCents(summable, "net_worth_cents");
  const attention = summable.filter((b) => b.health !== "green");
  const heroValue = fmt(netWorth);

  return (
    <SlotRevealProvider>
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        {/* HERO — combined net worth (brand-yellow, like the BDP capitalization hero) */}
        <section className={CARD} data-testid="aggregate-hero-card">
          <p className="text-caption text-[var(--muted-foreground)]">
            {t("hero_label")}
          </p>
          <p
            data-testid="aggregate-hero"
            className={`num ${heroFontClass(heroValue)}`}
            style={{ color: "var(--num-hero)" }}
          >
            <SlotAmount value={heroValue} />
          </p>
        </section>

        {/* STAT GRID — mirrors the BDP overview's grid-cols-2 stat cards */}
        <div className="grid grid-cols-2 gap-3">
          <StatCard
            label={t("investments")}
            value={fmt(sumCents(summable, "investments_cents"))}
          />
          <StatCard
            label={t("cash")}
            value={fmt(sumCents(summable, "cash_cents"))}
          />
          <StatCard
            label={t("reserves")}
            value={fmt(sumCents(summable, "reserves_cents"))}
          />
          {/* This-month flow: spent as the big figure, left as a sub-line. */}
          <section className={CARD}>
            <p className="text-caption text-[var(--muted-foreground)]">
              {t("flow_title")}
            </p>
            <p className="num mt-1 text-[20px] font-semibold text-[var(--body)]">
              <SlotAmount
                value={fmt(sumCents(summable, "spent_month_cents"))}
              />
            </p>
            <p className="text-caption text-[var(--muted-foreground)]">
              {t("left")}{" "}
              <span className="num text-[var(--body)]">
                <SlotAmount
                  value={fmt(sumCents(summable, "left_month_cents"))}
                />
              </span>
            </p>
          </section>
        </div>

        {/* PER-BUDGET BREAKDOWN — one card, hairline-divided rows */}
        {visible.length > 0 && (
          <section className={CARD}>
            <p className="mb-1 text-sm font-semibold text-[var(--body)]">
              {t("budgets_title")}
            </p>
            <ul className="divide-y divide-[var(--hairline-dark)]">
              {visible.map((b) => {
                const shareOfTotal =
                  !b.fx_unavailable && netWorth > 0n
                    ? Number((BigInt(b.net_worth_cents) * 10000n) / netWorth) /
                      100
                    : null;
                return (
                  <li key={b.id}>
                    <Link
                      href={`/${locale}/budgets/${b.id}/overview`}
                      className="flex items-center gap-3 py-2.5"
                    >
                      {!b.fx_unavailable && (
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: DOT[b.health] }}
                        />
                      )}
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-[var(--body)]">
                          {b.name}
                        </span>
                        {b.fx_unavailable && (
                          <span className="text-caption text-[var(--trading-down)]">
                            {t("rate_unavailable")}
                          </span>
                        )}
                      </span>
                      {b.my_share_pct < 100 && (
                        <span
                          data-testid={`aggregate-share-${b.id}`}
                          className="num text-caption text-[var(--muted-foreground)]"
                        >
                          {t("my_share", { pct: b.my_share_pct })}
                        </span>
                      )}
                      {shareOfTotal !== null && (
                        <span className="num text-caption text-[var(--muted-foreground)]">
                          {shareOfTotal}%
                        </span>
                      )}
                      {!b.fx_unavailable && (
                        <span className="num text-sm text-[var(--body)]">
                          <SlotAmount value={fmt(BigInt(b.net_worth_cents))} />
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        {/* WEALTH COMPOSITION */}
        <AggregateComposition
          cashCents={sumCents(summable, "cash_cents").toString()}
          investmentsCents={sumCents(summable, "investments_cents").toString()}
          reservesCents={(
            sumCents(summable, "reserves_cents") +
            sumCents(summable, "cushion_cents")
          ).toString()}
          currency={ccy}
          locale={locale}
        />

        {/* NET-WORTH TREND */}
        <AggregateTrend includeIds={summable.map((b) => b.id)} />

        {/* ATTENTION */}
        {attention.length > 0 && (
          <section className={CARD}>
            <p className="text-sm font-semibold text-[var(--body)]">
              {t("attention_title")}
            </p>
            <ul className="mt-2 space-y-1">
              {attention.map((b) => (
                <li key={b.id}>
                  <Link
                    href={`/${locale}/budgets/${b.id}/overview`}
                    className="flex justify-between text-caption"
                  >
                    <span className="truncate">{b.name}</span>
                    <span className="num text-[var(--trading-down)]">
                      {b.overspent_count > 0
                        ? fmt(b.overspent_total_cents)
                        : "•"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        {summable.length === 0 && (
          <p className="text-center text-caption text-[var(--muted-foreground)]">
            {t("empty")}
          </p>
        )}
      </div>
    </SlotRevealProvider>
  );
}
