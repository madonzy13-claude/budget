"use client";
/**
 * aggregate-overview.tsx — cross-budget "all budgets" overview (Task 13).
 *
 * Hero (combined net worth + investments/cash/reserves split), per-budget
 * breakdown (share of total, health dot, my-share badge, exclude toggle),
 * attention (overspent/cushion/reserves rollup), and this-month flow
 * (spent vs left). All figures are STRING cents already FX-converted into
 * `display_currency` by the API (Task 6/7) — summing them as BigInt then
 * formatting once is correct because every row shares that one currency.
 *
 * Inclusion is race-free: `overrides` is a Map of budget id → user-toggled
 * state for THIS session only. Effective inclusion (`effIncluded`) is the
 * override if one exists, else the server's `included` — no seeding effect,
 * so there is no render where a server-excluded budget is transiently
 * summed in before an effect corrects it.
 *
 * fx_unavailable rows (FX miss OR card-fetch error — Task 6) are never summed
 * and never shown with a health dot / net-worth figure, since `health` on
 * those rows can be a meaningless "green".
 */
import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import {
  useBudgetsAggregate,
  useSetAggregationFlag,
  type AggregateBudgetRow,
} from "@/hooks/use-budgets-aggregate";
import {
  SlotAmount,
  SlotRevealProvider,
} from "@/components/budgeting/overview/slot-amount";
import { centsToRounded } from "@/lib/cents-format";

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
  if (s.length >= 13) return "text-[24px] font-bold leading-[1.1]";
  if (s.length >= 10) return "text-[32px] font-bold leading-[1.1]";
  return "text-num-display";
}

export function AggregateOverview() {
  const t = useTranslations("aggregate");
  const locale = useLocale();
  const { data, isPending, isError } = useBudgetsAggregate();
  const setFlag = useSetAggregationFlag();

  // Session-only toggles, keyed by budget id. Absent = defer to server truth.
  const [overrides, setOverrides] = useState<Map<string, boolean>>(new Map());
  const effIncluded = (b: AggregateBudgetRow) =>
    !b.fx_unavailable &&
    (overrides.has(b.id) ? overrides.get(b.id)! : b.included);

  if (isPending)
    return (
      <div
        className="mx-auto max-w-[1280px] p-4"
        data-testid="aggregate-loading"
      />
    );
  if (isError || !data) return null;

  const rows = data.budgets;
  const ccy = data.display_currency;
  // Matches the overview page's own convention (overview-cards.tsx): EN
  // locale + narrow symbol always, whole units — no cents anywhere.
  const fmt = (cents: string | bigint) =>
    centsToRounded(cents, ccy, "en", true);

  const included = rows.filter(effIncluded);
  const netWorth = sumCents(included, "net_worth_cents");
  const attention = included.filter((b) => b.health !== "green");
  const heroValue = fmt(netWorth);

  function toggle(b: AggregateBudgetRow) {
    const next = !effIncluded(b);
    setOverrides((prev) => new Map(prev).set(b.id, next));
    setFlag.mutate({ budgetId: b.id, included: next });
  }

  return (
    <SlotRevealProvider>
      <main className="mx-auto max-w-[1280px] space-y-4 p-4">
        {/* HERO */}
        <section className={CARD}>
          <p className="text-caption text-[var(--muted-foreground)]">
            {t("hero_label")}
          </p>
          <p
            data-testid="aggregate-hero"
            className={`num text-[var(--num-hero)] ${heroFontClass(heroValue)}`}
          >
            <SlotAmount value={heroValue} />
          </p>
          <div className="mt-2 grid grid-cols-3 gap-2 text-caption">
            <div>
              <span className="text-[var(--muted-foreground)]">
                {t("investments")}
              </span>
              <br />
              <span className="num">
                <SlotAmount
                  value={fmt(sumCents(included, "investments_cents"))}
                />
              </span>
            </div>
            <div>
              <span className="text-[var(--muted-foreground)]">
                {t("cash")}
              </span>
              <br />
              <span className="num">
                <SlotAmount value={fmt(sumCents(included, "cash_cents"))} />
              </span>
            </div>
            <div>
              <span className="text-[var(--muted-foreground)]">
                {t("reserves")}
              </span>
              <br />
              <span className="num">
                <SlotAmount value={fmt(sumCents(included, "reserves_cents"))} />
              </span>
            </div>
          </div>
        </section>

        {/* PER-BUDGET BREAKDOWN */}
        <section className="space-y-2">
          {rows.map((b) => {
            const off = !effIncluded(b);
            const shareOfTotal =
              effIncluded(b) && netWorth > 0n
                ? Number((BigInt(b.net_worth_cents) * 10000n) / netWorth) / 100
                : null;
            return (
              <div
                key={b.id}
                className={`${CARD} flex items-center gap-3 ${off ? "opacity-50" : ""}`}
              >
                {!b.fx_unavailable && (
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ background: DOT[b.health] }}
                  />
                )}
                <Link
                  href={`/${locale}/budgets/${b.id}/overview`}
                  className="min-w-0 flex-1"
                >
                  <p className="truncate text-sm font-semibold text-[var(--body)]">
                    {b.name}
                  </p>
                  {b.fx_unavailable && (
                    <p className="text-caption text-[var(--trading-down)]">
                      {t("rate_unavailable")}
                    </p>
                  )}
                </Link>
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
                  <span className="num text-sm">
                    <SlotAmount value={fmt(BigInt(b.net_worth_cents))} />
                  </span>
                )}
                {!b.fx_unavailable && (
                  <button
                    type="button"
                    data-testid={`aggregate-exclude-${b.id}`}
                    onClick={() => toggle(b)}
                    aria-pressed={!off}
                    className="shrink-0 text-caption text-[var(--muted-foreground)]"
                  >
                    {off ? "＋" : "－"}
                  </button>
                )}
              </div>
            );
          })}
        </section>

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

        {/* THIS-MONTH FLOW */}
        <section className={`${CARD} flex justify-between`}>
          <div>
            <p className="text-caption text-[var(--muted-foreground)]">
              {t("spent")}
            </p>
            <p className="num">
              <SlotAmount
                value={fmt(sumCents(included, "spent_month_cents"))}
              />
            </p>
          </div>
          <div className="text-right">
            <p className="text-caption text-[var(--muted-foreground)]">
              {t("left")}
            </p>
            <p className="num">
              <SlotAmount value={fmt(sumCents(included, "left_month_cents"))} />
            </p>
          </div>
        </section>

        {included.length === 0 && (
          <p className="text-center text-caption text-[var(--muted-foreground)]">
            {t("empty")}
          </p>
        )}
      </main>
    </SlotRevealProvider>
  );
}
