"use client";
/**
 * aggregate-overview.tsx — cross-budget "all budgets" overview.
 *
 * Mirrors the single-budget BDP Overview tab: a net-worth hero banner (big
 * yellow figure + "incl. investments" sub-line + a masked day P/L block, like
 * the capitalization card) + a grid-cols-2 stat grid (Available-to-spend /
 * Available reserves / Overspent / Cushion, with the same indicators + Needed/
 * Saved sub-lines) + a Budgets & tasks banner + a SEPARATE range selector
 * driving the net-worth-over-time area chart + view-driven pie.
 *
 * Only budgets the member INCLUDES are summed into the totals (`b.included`);
 * the Budgets & tasks banner lists ALL of the user's budgets. Every figure is
 * STRING cents already FX-converted into `display_currency` by the API.
 */
import { type ReactNode, useState } from "react";
import { useTranslations } from "next-intl";
import {
  CircleAlert,
  CircleCheck,
  CirclePlus,
  Hourglass,
  TrendingDown,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useBudgetsAggregate,
  useAggregateWealth,
  type AggregateBudgetRow,
} from "@/hooks/use-budgets-aggregate";
import {
  SlotAmount,
  SlotRevealProvider,
} from "@/components/budgeting/overview/slot-amount";
import { centsToRounded } from "@/lib/cents-format";
import { AggregateTrend } from "@/components/budgeting/aggregate/aggregate-trend";
import { AggregateBudgetsTasks } from "@/components/budgeting/aggregate/aggregate-budgets-tasks";
import { RangeSelector } from "@/components/budgeting/overview/range-selector";
import { makeRange, todayInTz, type OverviewRange } from "@/lib/overview-range";
import { useUserTimezone } from "@/components/common/user-timezone-provider";

const CARD =
  "rounded-[var(--radius-xl)] bg-[var(--surface-card-dark)] border border-[var(--hairline-dark)] p-4 min-w-0";

function sumCents(rows: AggregateBudgetRow[], key: keyof AggregateBudgetRow) {
  return rows.reduce((total, r) => total + BigInt(r[key] as string), 0n);
}

/** Exact copy of overview-cards.tsx's heroFontClass (BDP capitalization card). */
function heroFontClass(s: string): string {
  if (s.length >= 13) return "text-[24px] font-bold leading-[1.1]";
  if (s.length >= 10) return "text-[32px] font-bold leading-[1.1]";
  return "text-num-display";
}

// ponytail: copy of overview-cards.tsx's formatRunway (a private fn there) —
// duplicating 15 lines beats exporting from that big "use client" module.
function formatRunway(
  realMonths: number,
  units: { y: string; m: string; d: string },
): string {
  const safe = Number.isFinite(realMonths) ? Math.max(0, realMonths) : 0;
  let months = Math.floor(safe);
  let days = Math.round((safe - months) * 30.44);
  if (days >= 30) {
    months += 1;
    days = 0;
  }
  const years = Math.floor(months / 12);
  months = months % 12;
  const parts: string[] = [];
  if (years) parts.push(`${years}${units.y}`);
  if (months) parts.push(`${months}${units.m}`);
  if (days) parts.push(`${days}${units.d}`);
  return parts.length ? parts.join(" ") : `0${units.d}`;
}

/** A BDP-overview stat card: (optional icon on the figure line +) caption label,
 *  a big figure (any node — callers pass a masked SlotAmount or a plain runway),
 *  and an optional sub-line — same shape/tokens as overview-cards' grid cards. */
function StatCard({
  label,
  value,
  icon,
  sub,
  testid,
}: {
  label: string;
  value: ReactNode;
  icon?: ReactNode;
  sub?: ReactNode;
  testid?: string;
}) {
  return (
    <section className={CARD} data-testid={testid}>
      <p className="text-caption text-[var(--muted-foreground)]">{label}</p>
      <p className="num text-title-md mt-1 flex items-center gap-1.5 whitespace-nowrap text-[var(--body-on-dark)]">
        {icon}
        {/* NOT truncate/overflow-hidden: it clips the blur's vertical spread and
            trims the masked amount top/bottom (BDP just uses whitespace-nowrap). */}
        <span className="whitespace-nowrap">{value}</span>
      </p>
      {sub}
    </section>
  );
}

const ICON = "size-4 shrink-0";
const iconOk = (
  <CircleCheck className={`${ICON} text-[var(--trading-up)]`} aria-hidden />
);
const iconBad = (
  <CircleAlert className={`${ICON} text-[var(--trading-down)]`} aria-hidden />
);

export function AggregateOverview() {
  const t = useTranslations("aggregate");
  const tz = useUserTimezone();
  const { data, isPending, isError } = useBudgetsAggregate();

  // Hooks run unconditionally (before early returns). Range for the chart lives
  // here (a SEPARATE selector, like the BDP band) so it isn't merged into the
  // chart card. The day P/L reuses the wealth trend over a today-only window.
  const [range, setRange] = useState<OverviewRange>(() =>
    makeRange("last6Months", tz),
  );
  // Net-worth hero flips (like the BDP capitalization card) to show how long the
  // money lasts at current spending.
  const [flipped, setFlipped] = useState(false);
  const today = todayInTz(tz).toString();
  const summableIds = (data?.budgets ?? [])
    .filter((b) => b.included && !b.fx_unavailable)
    .map((b) => b.id);
  const pl = useAggregateWealth(summableIds, today, today);

  if (isPending)
    return (
      <div className="mx-auto max-w-2xl p-4" data-testid="aggregate-loading" />
    );
  if (isError || !data) return null;

  const ccy = data.display_currency;
  const fmt = (cents: string | bigint) =>
    centsToRounded(cents, ccy, "en", true);

  const summable = data.budgets.filter((b) => b.included && !b.fx_unavailable);
  const netWorth = sumCents(summable, "net_worth_cents");
  const investments = sumCents(summable, "investments_cents");
  const heroValue = fmt(netWorth);

  // ── BDP-parity stat cards: sum every per-budget figure, derive each card's
  //    good/short/surplus indicator from the summed totals. These operational
  //    cards use FULL household amounts (NOT ownership-share-scaled). ─────────
  const cashTotal = sumCents(summable, "cash_full_cents");
  const spentTotal = sumCents(summable, "spent_month_cents");
  const leftTotal = sumCents(summable, "left_month_cents");
  const reservesTotal = sumCents(summable, "reserves_full_cents");
  const reservesReq = sumCents(summable, "reserves_required_cents");
  // Cushion coverage is a HOUSEHOLD safety check → FULL cushion wallets vs FULL
  // required across every applied budget (NOT the member's ownership share).
  const cushionSaved = sumCents(summable, "cushion_saved_full_cents");
  const cushionReq = sumCents(summable, "cushion_required_full_cents");
  const overspentTotal = sumCents(summable, "overspent_total_cents");
  const overspentCount = summable.reduce((n, b) => n + b.overspent_count, 0);
  // Top overspent category across every budget (highest single-category overspend).
  const overspentTop = summable
    .filter((b) => b.overspent_top_name && BigInt(b.overspent_top_cents) > 0n)
    .sort((a, b) =>
      BigInt(b.overspent_top_cents) > BigInt(a.overspent_top_cents) ? 1 : -1,
    )[0];

  const spendGood = cashTotal >= leftTotal;
  const anyReserves = reservesTotal > 0n || reservesReq > 0n;
  const reservesShort = reservesTotal < reservesReq;
  const reservesSurplus = reservesTotal > reservesReq;
  const anyCushion = cushionSaved > 0n || cushionReq > 0n;
  const cushionCovered = cushionSaved >= cushionReq;
  const cushionUnlimited = cushionReq === 0n && cushionSaved > 0n;
  // Household cushion runway = Σ(all cushion wallets) ÷ Σ(monthly cushion need
  // across every applied budget). monthly need = required ÷ target_months, so a
  // budget that BUDGETS a cushion but hasn't funded its wallet still adds its
  // need (the old saved/real_months form silently dropped it at 0 balance).
  const cushionMonthlyNeed = summable.reduce(
    (acc, b) => acc + Number(b.cushion_monthly_cents),
    0,
  );
  const cushionRunwayMonths =
    cushionMonthlyNeed > 0
      ? Number(cushionSaved) / cushionMonthlyNeed
      : Infinity;
  const runwayUnits = { y: t("runway_y"), m: t("runway_m"), d: t("runway_d") };

  // Net-worth flip back = the BDP retirement runway, aggregated: how long the
  // net worth lasts at the monthly PLANNED spend (cushion-aware; excludes
  // Investments), spending GROWING at 4.5%/yr inflation. BOTH sides share-scaled
  // (the runway is fractionalized by ownership like the hero net worth).
  const RETIRE_INFLATION_PCT = 4.5;
  const plannedTotal = sumCents(summable, "monthly_planned_cents");
  const nwRunwayMonths = (() => {
    if (plannedTotal <= 0n) return Infinity;
    // N = ln(1 + W·r/s) / ln(1+r), r = monthly inflation (same closed form as
    // get-overview-cards' retirement_months).
    const W = Number(netWorth);
    const s = Number(plannedTotal);
    const r = Math.pow(1 + RETIRE_INFLATION_PCT / 100, 1 / 12) - 1;
    return Math.log(1 + (W * r) / s) / Math.log(1 + r);
  })();
  const nwUnlimited = plannedTotal <= 0n && netWorth > 0n;
  const canFlip = summable.length > 0 && netWorth > 0n;

  // Full-words duration ("13 years and 6 months"), zero components dropped —
  // matches the BDP retirement flip back.
  const durationFull = (totalMonths: number): string => {
    const total = Math.max(0, Math.round(totalMonths));
    const years = Math.floor(total / 12);
    const months = total % 12;
    const y = years ? t("years", { count: years }) : null;
    const m = months ? t("months", { count: months }) : null;
    if (y && m) return `${y} ${t("and")} ${m}`;
    return y ?? m ?? t("months", { count: 0 });
  };

  const plGrow = pl.data && pl.data.series.length > 0 ? pl.data.grow : null;
  const plUp = plGrow ? Number(plGrow.delta_cents) >= 0 : false;
  const PlIcon = plUp ? TrendingUp : TrendingDown;

  return (
    <SlotRevealProvider>
      <div className="mx-auto flex max-w-2xl flex-col gap-3">
        {/* HERO — net worth (yellow) + incl. investments + day P/L. A FLIP card
            (like the BDP capitalization card): tapping empty space rotates to the
            back = how long the money lasts at current spend. Tapping an amount
            reveals it (SlotAmount stops the flip). */}
        <section
          data-testid="aggregate-hero-card"
          className={cn(
            CARD,
            "relative [perspective:1200px]",
            canFlip && "cursor-pointer select-none",
          )}
          {...(canFlip && {
            role: "button",
            tabIndex: 0,
            "aria-label": t("retire_label"),
            onClick: () => setFlipped((f) => !f),
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setFlipped((f) => !f);
              }
            },
          })}
        >
          <div
            className="relative transition-transform duration-500 [transform-style:preserve-3d]"
            style={{
              transform:
                canFlip && flipped ? "rotateY(180deg)" : "rotateY(0deg)",
            }}
          >
            {/* FRONT — in flow (sets the card height). Mirrors the BDP
                capitalization card layout exactly so paddings read identically. */}
            <div className="[backface-visibility:hidden]">
              <p className="text-caption text-[var(--muted-foreground)]">
                {t("hero_label")}
              </p>
              <div className="mt-1 flex flex-nowrap items-center justify-between gap-x-3">
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <p
                    data-testid="aggregate-hero"
                    className={`num ${heroFontClass(heroValue)}`}
                    style={{ color: "var(--num-hero)" }}
                  >
                    <SlotAmount value={heroValue} />
                  </p>
                  {investments > 0n && (
                    <p className="text-caption text-[var(--muted-foreground)]">
                      {t("incl_investments")}{" "}
                      <span className="num text-[var(--muted-foreground)]">
                        <SlotAmount value={fmt(investments)} />
                      </span>
                    </p>
                  )}
                </div>
                {plGrow && (
                  <div
                    className={cn(
                      "text-caption flex shrink-0 flex-col items-end gap-0.5 text-right",
                      plUp
                        ? "text-[var(--trading-up)]"
                        : "text-[var(--trading-down)]",
                    )}
                    data-testid="aggregate-hero-pl"
                  >
                    <span className="num flex items-center gap-1">
                      <PlIcon
                        className="size-3.5 shrink-0"
                        aria-hidden="true"
                      />
                      <SlotAmount
                        value={`${plUp ? "+" : ""}${plGrow.delta_pct.toFixed(1)}%`}
                      />
                    </span>
                    <span className="num">
                      <SlotAmount
                        value={`${plUp ? "+" : ""}${fmt(plGrow.delta_cents)}`}
                      />
                    </span>
                    <span className="text-[10px] leading-tight text-[var(--muted-foreground)]">
                      {t("since_yesterday")}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* BACK — money runway (netWorth ÷ Σspend). Same style as the BDP
                retirement flip: hourglass + full-words duration + a note. */}
            {canFlip && (
              <div
                data-testid="aggregate-hero-runway"
                className="absolute inset-0 flex flex-col justify-between [backface-visibility:hidden] [transform:rotateY(180deg)]"
              >
                <p className="text-caption text-[var(--muted-foreground)]">
                  {t("retire_label")}
                </p>
                <div className="flex items-center gap-2">
                  <Hourglass
                    className="size-5 shrink-0 text-[var(--primary)]"
                    aria-hidden="true"
                  />
                  <span className="text-title-md font-semibold text-[var(--body-on-dark)]">
                    {nwUnlimited ? "∞" : durationFull(nwRunwayMonths)}
                  </span>
                </div>
                <p className="text-caption text-[var(--muted-foreground)]">
                  {t("retire_inflation", { pct: RETIRE_INFLATION_PCT })}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* STAT GRID — BDP-overview parity: Available-to-spend / Available
            reserves / Overspent / Cushion, equal-height (auto-rows-fr). */}
        <div className="grid auto-rows-fr grid-cols-2 gap-3">
          {/* Available to spend — cash on top, spent + left below. */}
          <StatCard
            testid="aggregate-card-available-to-spend"
            label={t("available_to_spend")}
            icon={spendGood ? iconOk : iconBad}
            value={<SlotAmount value={fmt(cashTotal)} />}
            sub={
              <dl className="text-caption mt-1.5 flex flex-col gap-0.5 text-[var(--muted-foreground)]">
                <div className="flex items-center justify-between gap-2">
                  <dt>{t("spent")}</dt>
                  <dd className="num text-[var(--body-on-dark)]">
                    <SlotAmount value={fmt(spentTotal)} />
                  </dd>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <dt>{t("left")}</dt>
                  <dd className="num text-[var(--body-on-dark)]">
                    <SlotAmount value={fmt(leftTotal)} />
                  </dd>
                </div>
              </dl>
            }
          />

          {/* Available reserves — shown only when some budget uses reserves. */}
          {anyReserves && (
            <StatCard
              testid="aggregate-card-reserves"
              label={t("available_reserves")}
              icon={
                reservesShort ? (
                  iconBad
                ) : reservesSurplus ? (
                  <CirclePlus
                    className={`${ICON} text-[var(--warning)]`}
                    aria-hidden
                  />
                ) : (
                  iconOk
                )
              }
              value={<SlotAmount value={fmt(reservesTotal)} />}
              sub={
                <dl className="text-caption mt-1.5 flex items-center justify-between gap-2 text-[var(--muted-foreground)]">
                  <dt>{t("needed")}</dt>
                  <dd className="num text-[var(--body-on-dark)]">
                    <SlotAmount value={fmt(reservesReq)} />
                  </dd>
                </dl>
              }
            />
          )}

          {/* Overspent — green "0" + motivation when clean, else red total + top category. */}
          <StatCard
            testid="aggregate-card-overspent"
            label={t("overspent")}
            icon={overspentCount === 0 ? iconOk : iconBad}
            value={
              overspentCount === 0 ? (
                fmt(0n)
              ) : (
                <SlotAmount value={fmt(overspentTotal)} />
              )
            }
            sub={
              <p className="text-caption mt-1.5 truncate text-[var(--muted-foreground)]">
                {overspentCount === 0
                  ? t("overspent_ok")
                  : (overspentTop?.overspent_top_name ?? "")}
              </p>
            }
          />

          {/* Cushion — runway (never masked, it's a duration) + saved/needed. */}
          {anyCushion && (
            <StatCard
              testid="aggregate-card-cushion"
              label={t("cushion")}
              icon={cushionCovered ? iconOk : iconBad}
              value={
                cushionUnlimited ? (
                  <span data-testid="aggregate-cushion-unlimited">∞</span>
                ) : (
                  formatRunway(cushionRunwayMonths, runwayUnits)
                )
              }
              sub={
                <dl className="text-caption mt-1.5 flex flex-col gap-0.5 text-[var(--muted-foreground)]">
                  <div className="flex items-center justify-between gap-2">
                    <dt>{t("saved")}</dt>
                    <dd className="num text-[var(--body-on-dark)]">
                      <SlotAmount value={fmt(cushionSaved)} />
                    </dd>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <dt>{t("needed")}</dt>
                    <dd className="num text-[var(--body-on-dark)]">
                      <SlotAmount value={fmt(cushionReq)} />
                    </dd>
                  </div>
                </dl>
              }
            />
          )}
        </div>

        {/* BUDGETS & TASKS — all budgets, each with its pending tasks */}
        <AggregateBudgetsTasks
          budgets={data.budgets.map((b) => ({ id: b.id, name: b.name }))}
        />

        {/* RANGE SELECTOR — a SEPARATE piece (not inside the chart), like BDP's band */}
        <div className="py-1" data-testid="aggregate-range">
          <RangeSelector value={range} onChange={setRange} />
        </div>

        {/* NET WORTH OVER TIME — view toggle (cap/invest) + contributions +
            growth + area chart + a view-driven pie (cap pools vs holding type) */}
        <AggregateTrend
          includeIds={summable.map((b) => b.id)}
          range={range}
          currency={ccy}
          capitalization={{
            investmentsCents: investments.toString(),
            cashCents: sumCents(summable, "cash_cents").toString(),
            reservesCents: sumCents(summable, "reserves_cents").toString(),
            cushionCents: sumCents(summable, "cushion_cents").toString(),
          }}
        />

        {summable.length === 0 && (
          <p className="text-center text-caption text-[var(--muted-foreground)]">
            {t("empty")}
          </p>
        )}
      </div>
    </SlotRevealProvider>
  );
}
